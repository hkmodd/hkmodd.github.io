use wasm_bindgen::prelude::*;
use std::f32::consts::PI;

// ═══════════════════════════════════════════════════════════════════
//  NEURAL ENGINE — Rust WASM high-perf simulation for NeuralMesh v3
//  All per-frame math runs here at near-native speed.
//  JS only reads the output buffers and uploads to Three.js GPU.
// ═══════════════════════════════════════════════════════════════════

const FIELD_SIZE: f32 = 20.0;

/// Depth layers for parallax — 3 discrete z-planes
struct DepthLayer {
    z: f32,
    fraction: f32,
    scale: f32,
    opacity: f32,
}

const DEPTH_LAYERS: [DepthLayer; 3] = [
    DepthLayer { z: -8.0, fraction: 0.25, scale: 0.5, opacity: 0.3 },
    DepthLayer { z: -3.0, fraction: 0.45, scale: 0.8, opacity: 0.6 },
    DepthLayer { z:  2.0, fraction: 0.30, scale: 1.2, opacity: 1.0 },
];

// ── Pseudo-random (deterministic, no std rand needed) ──────────────
fn splitmix(mut x: u32) -> u32 {
    x = x.wrapping_add(0x9e3779b9);
    x ^= x >> 16;
    x = x.wrapping_mul(0x85ebca6b);
    x ^= x >> 13;
    x = x.wrapping_mul(0xc2b2ae35);
    x ^= x >> 16;
    x
}

fn rand_f32(seed: &mut u32) -> f32 {
    *seed = splitmix(*seed);
    (*seed as f32) / (u32::MAX as f32)
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN ENGINE
// ═══════════════════════════════════════════════════════════════════

#[wasm_bindgen]
pub struct NeuralEngine {
    node_count: usize,
    max_connections: usize,
    pulse_count: usize,
    connection_dist: f32,

    // Node data (static — set at init)
    base_positions: Vec<f32>,    // [x,y,z] × node_count
    base_opacities: Vec<f32>,
    base_sizes: Vec<f32>,
    phases: Vec<f32>,
    speeds: Vec<f32>,

    // Node output (mutated each frame, read by JS)
    live_positions: Vec<f32>,
    live_opacities: Vec<f32>,
    live_sizes: Vec<f32>,

    // Connection output
    conn_positions: Vec<f32>,    // [ax,ay,az, bx,by,bz] × max_connections
    conn_colors: Vec<f32>,       // [r,g,b, r,g,b] × max_connections
    conn_count: usize,           // how many active this frame

    // Pulse data
    pulse_from: Vec<usize>,
    pulse_to: Vec<usize>,
    pulse_progress: Vec<f32>,
    pulse_speed: Vec<f32>,
    pulse_matrices: Vec<f32>,    // 16 floats per pulse (4×4 matrix)

    // Current theme color (lerped)
    color_r: f32,
    color_g: f32,
    color_b: f32,

    // Elapsed time accumulator
    elapsed: f32,
}

#[wasm_bindgen]
impl NeuralEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(node_count: usize, max_connections: usize, pulse_count: usize, connection_dist: f32) -> Self {
        let mut seed: u32 = 42;

        // ── Allocate node buffers ──
        let mut base_positions = vec![0.0f32; node_count * 3];
        let mut base_opacities = vec![0.0f32; node_count];
        let mut base_sizes = vec![0.0f32; node_count];
        let mut phases = vec![0.0f32; node_count];
        let mut speeds = vec![0.0f32; node_count];

        // ── Distribute nodes across depth layers ──
        let mut idx = 0usize;
        for layer in &DEPTH_LAYERS {
            let layer_count = (node_count as f32 * layer.fraction) as usize;
            for _ in 0..layer_count {
                if idx >= node_count { break; }
                let i3 = idx * 3;
                base_positions[i3]     = (rand_f32(&mut seed) - 0.5) * FIELD_SIZE;
                base_positions[i3 + 1] = (rand_f32(&mut seed) - 0.5) * FIELD_SIZE;
                base_positions[i3 + 2] = layer.z + (rand_f32(&mut seed) - 0.5) * 4.0;
                base_opacities[idx] = layer.opacity;
                base_sizes[idx] = layer.scale;
                phases[idx] = rand_f32(&mut seed) * PI * 2.0;
                speeds[idx] = 0.4 + rand_f32(&mut seed) * 1.2;
                idx += 1;
            }
        }
        // Fill remaining
        while idx < node_count {
            let i3 = idx * 3;
            base_positions[i3]     = (rand_f32(&mut seed) - 0.5) * FIELD_SIZE;
            base_positions[i3 + 1] = (rand_f32(&mut seed) - 0.5) * FIELD_SIZE;
            base_positions[i3 + 2] = (rand_f32(&mut seed) - 0.5) * 10.0;
            base_opacities[idx] = 0.5;
            base_sizes[idx] = 0.7;
            phases[idx] = rand_f32(&mut seed) * PI * 2.0;
            speeds[idx] = 0.5 + rand_f32(&mut seed) * 1.0;
            idx += 1;
        }

        // ── Pulse init ──
        let mut pulse_from = vec![0usize; pulse_count];
        let mut pulse_to = vec![0usize; pulse_count];
        let mut pulse_progress = vec![0.0f32; pulse_count];
        let mut pulse_speed = vec![0.0f32; pulse_count];
        for i in 0..pulse_count {
            pulse_from[i] = (rand_f32(&mut seed) * node_count as f32) as usize % node_count;
            pulse_to[i] = (rand_f32(&mut seed) * node_count as f32) as usize % node_count;
            pulse_progress[i] = rand_f32(&mut seed);
            pulse_speed[i] = 0.3 + rand_f32(&mut seed) * 0.8;
        }

        NeuralEngine {
            node_count,
            max_connections,
            pulse_count,
            connection_dist,

            live_positions: base_positions.clone(),
            live_opacities: base_opacities.clone(),
            live_sizes: base_sizes.clone(),

            base_positions,
            base_opacities,
            base_sizes,
            phases,
            speeds,

            conn_positions: vec![0.0; max_connections * 6],
            conn_colors: vec![0.0; max_connections * 6],
            conn_count: 0,

            pulse_from,
            pulse_to,
            pulse_progress,
            pulse_speed,
            pulse_matrices: vec![0.0; pulse_count * 16],

            color_r: 0.0,
            color_g: 0.831,
            color_b: 1.0,  // #00d4ff

            elapsed: 0.0,
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  TICK — called every frame from JS useFrame()
    // ═══════════════════════════════════════════════════════════════

    pub fn tick(
        &mut self,
        dt: f32,
        pointer_x: f32,
        pointer_y: f32,
        pointer_z: f32,
        target_r: f32,
        target_g: f32,
        target_b: f32,
        transitioning: bool,
    ) {
        self.elapsed += dt;
        let t = self.elapsed;

        // ── Lerp theme color ──
        let lerp_rate = 0.04;
        self.color_r += (target_r - self.color_r) * lerp_rate;
        self.color_g += (target_g - self.color_g) * lerp_rate;
        self.color_b += (target_b - self.color_b) * lerp_rate;

        let speed_burst = if transitioning { 5.0 } else { 1.0 };
        let breathe = (t * 0.5).sin() * 0.35;

        // ══════════════════════════════════════════════════════════
        //  1. NODE SIMULATION
        // ══════════════════════════════════════════════════════════

        for i in 0..self.node_count {
            let i3 = i * 3;
            let base_x = self.base_positions[i3];
            let base_y = self.base_positions[i3 + 1];
            let base_z = self.base_positions[i3 + 2];
            let phase = self.phases[i];
            let speed = self.speeds[i];

            // Lissajous drift + breathing
            let mut x = base_x + (t * 0.25 * speed + phase).sin() * 1.2 * speed_burst;
            let mut y = base_y + (t * 0.2 * speed + phase * 1.3).cos() * 1.2 * speed_burst;
            let mut z = base_z + (t * 0.15 * speed + phase * 0.7).sin() * 0.6 + breathe;

            // ── Pointer repulsion ──
            let dx = x - pointer_x;
            let dy = y - pointer_y;
            let dz = z - pointer_z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();

            if dist < 4.5 && dist > 0.001 {
                let norm = 1.0 - dist / 4.5;
                let force = norm * norm * 2.8;
                let inv_dist = 1.0 / dist;
                x += dx * inv_dist * force;
                y += dy * inv_dist * force;
                z += dz * inv_dist * force * 0.5;
            }

            self.live_positions[i3] = x;
            self.live_positions[i3 + 1] = y;
            self.live_positions[i3 + 2] = z;

            // Proximity brightness boost
            let p_dx = x - pointer_x;
            let p_dy = y - pointer_y;
            let p_dist = (p_dx * p_dx + p_dy * p_dy).sqrt();
            let proximity = (1.0 - p_dist / 6.0).max(0.0);
            self.live_opacities[i] = self.base_opacities[i] + proximity * 0.7;
            self.live_sizes[i] = self.base_sizes[i] * (1.0 + proximity * 1.0);
        }

        // ══════════════════════════════════════════════════════════
        //  2. CONNECTION BUILDER (O(n²) with early-exit)
        // ══════════════════════════════════════════════════════════

        let conn_dist = self.connection_dist;
        let trans_mul = if transitioning { 2.0 } else { 1.0 };
        let mut line_idx = 0usize;

        'outer: for i in 0..self.node_count {
            let ax = self.live_positions[i * 3];
            let ay = self.live_positions[i * 3 + 1];
            let az = self.live_positions[i * 3 + 2];

            for j in (i + 1)..self.node_count {
                if line_idx >= self.max_connections { break 'outer; }

                let bx = self.live_positions[j * 3];
                let by = self.live_positions[j * 3 + 1];
                let bz = self.live_positions[j * 3 + 2];

                // Axis-aligned early exit
                let dx = ax - bx;
                if dx > conn_dist || dx < -conn_dist { continue; }
                let dy = ay - by;
                if dy > conn_dist || dy < -conn_dist { continue; }
                let dz = az - bz;
                if dz > conn_dist || dz < -conn_dist { continue; }

                let d = (dx * dx + dy * dy + dz * dz).sqrt();
                if d >= conn_dist { continue; }

                let alpha = 1.0 - d / conn_dist;
                let mid_x = (ax + bx) * 0.5;
                let mid_y = (ay + by) * 0.5;
                let p_dx = mid_x - pointer_x;
                let p_dy = mid_y - pointer_y;
                let p_dist = (p_dx * p_dx + p_dy * p_dy).sqrt();
                let proximity = (1.0 - p_dist / 4.0).max(0.0);

                let brightness = (alpha * 0.5 + proximity * 1.2) * trans_mul;

                // Depth fog
                let avg_z = (az + bz) * 0.5;
                let depth_fog = smoothstep(avg_z, -10.0, 4.0);
                let final_bright = brightness * (0.3 + depth_fog * 0.7);

                let i6 = line_idx * 6;
                self.conn_positions[i6]     = ax;
                self.conn_positions[i6 + 1] = ay;
                self.conn_positions[i6 + 2] = az;
                self.conn_positions[i6 + 3] = bx;
                self.conn_positions[i6 + 4] = by;
                self.conn_positions[i6 + 5] = bz;

                let r = self.color_r * final_bright;
                let g = self.color_g * final_bright;
                let b = self.color_b * final_bright;
                self.conn_colors[i6]     = r;
                self.conn_colors[i6 + 1] = g;
                self.conn_colors[i6 + 2] = b;
                self.conn_colors[i6 + 3] = r;
                self.conn_colors[i6 + 4] = g;
                self.conn_colors[i6 + 5] = b;

                line_idx += 1;
            }
        }

        // Zero-fill remaining
        for k in (line_idx * 6)..(self.max_connections * 6) {
            self.conn_positions[k] = 0.0;
            self.conn_colors[k] = 0.0;
        }
        self.conn_count = line_idx;

        // ══════════════════════════════════════════════════════════
        //  3. PULSE INTERPOLATION
        // ══════════════════════════════════════════════════════════

        let mut seed = ((t * 1000.0) as u32).wrapping_add(7);

        for i in 0..self.pulse_count {
            self.pulse_progress[i] += dt * self.pulse_speed[i];

            if self.pulse_progress[i] >= 1.0 {
                self.pulse_from[i] = self.pulse_to[i];
                self.pulse_to[i] = (rand_f32(&mut seed) * self.node_count as f32) as usize % self.node_count;
                self.pulse_progress[i] = 0.0;
                self.pulse_speed[i] = 0.3 + rand_f32(&mut seed) * 0.8;
            }

            let fi = self.pulse_from[i] * 3;
            let ti = self.pulse_to[i] * 3;
            let p = self.pulse_progress[i];

            let fx = self.live_positions[fi];
            let fy = self.live_positions[fi + 1];
            let fz = self.live_positions[fi + 2];
            let tx = self.live_positions[ti];
            let ty = self.live_positions[ti + 1];
            let tz = self.live_positions[ti + 2];

            let px = fx + (tx - fx) * p;
            let py = fy + (ty - fy) * p;
            let pz = fz + (tz - fz) * p + (p * PI).sin() * 0.8;

            let s = 1.0 + (p * PI).sin() * 1.2;

            // Build 4×4 scale+translate matrix (column-major for Three.js)
            let m = i * 16;
            // Column 0
            self.pulse_matrices[m]      = s;
            self.pulse_matrices[m + 1]  = 0.0;
            self.pulse_matrices[m + 2]  = 0.0;
            self.pulse_matrices[m + 3]  = 0.0;
            // Column 1
            self.pulse_matrices[m + 4]  = 0.0;
            self.pulse_matrices[m + 5]  = s;
            self.pulse_matrices[m + 6]  = 0.0;
            self.pulse_matrices[m + 7]  = 0.0;
            // Column 2
            self.pulse_matrices[m + 8]  = 0.0;
            self.pulse_matrices[m + 9]  = 0.0;
            self.pulse_matrices[m + 10] = s;
            self.pulse_matrices[m + 11] = 0.0;
            // Column 3 (translation)
            self.pulse_matrices[m + 12] = px;
            self.pulse_matrices[m + 13] = py;
            self.pulse_matrices[m + 14] = pz;
            self.pulse_matrices[m + 15] = 1.0;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  BUFFER ACCESS — zero-copy views for JS
    // ═══════════════════════════════════════════════════════════════

    pub fn positions_ptr(&self) -> *const f32 { self.live_positions.as_ptr() }
    pub fn positions_len(&self) -> usize { self.live_positions.len() }

    pub fn opacities_ptr(&self) -> *const f32 { self.live_opacities.as_ptr() }
    pub fn opacities_len(&self) -> usize { self.live_opacities.len() }

    pub fn sizes_ptr(&self) -> *const f32 { self.live_sizes.as_ptr() }
    pub fn sizes_len(&self) -> usize { self.live_sizes.len() }

    pub fn conn_positions_ptr(&self) -> *const f32 { self.conn_positions.as_ptr() }
    pub fn conn_positions_len(&self) -> usize { self.conn_positions.len() }

    pub fn conn_colors_ptr(&self) -> *const f32 { self.conn_colors.as_ptr() }
    pub fn conn_colors_len(&self) -> usize { self.conn_colors.len() }

    pub fn conn_count(&self) -> usize { self.conn_count }

    pub fn pulse_matrices_ptr(&self) -> *const f32 { self.pulse_matrices.as_ptr() }
    pub fn pulse_matrices_len(&self) -> usize { self.pulse_matrices.len() }

    pub fn node_count(&self) -> usize { self.node_count }
    pub fn pulse_count(&self) -> usize { self.pulse_count }

    pub fn color_r(&self) -> f32 { self.color_r }
    pub fn color_g(&self) -> f32 { self.color_g }
    pub fn color_b(&self) -> f32 { self.color_b }
}

// ── GLSL-style smoothstep ──────────────────────────────────────────
fn smoothstep(x: f32, edge0: f32, edge1: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
