use wasm_bindgen::prelude::*;
use std::f32::consts::PI;

// ═══════════════════════════════════════════════════════════════════
//  NEURAL ENGINE — EXTREME OVERCLOCK (Boids + Lorenz Storm)
// ═══════════════════════════════════════════════════════════════════

const FIELD_SIZE: f32 = 25.0;

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

fn hash(x: f32, y: f32, z: f32) -> f32 {
    let mut h = (x * 127.1 + y * 311.7 + z * 74.7).fract();
    h = (h * 43758.5453123).fract();
    h * 2.0 - 1.0
}

fn noise3d(x: f32, y: f32, z: f32) -> f32 {
    let ix = x.floor(); let iy = y.floor(); let iz = z.floor();
    let fx = x.fract(); let fy = y.fract(); let fz = z.fract();
    
    let u = fx * fx * (3.0 - 2.0 * fx);
    let v = fy * fy * (3.0 - 2.0 * fy);
    let w = fz * fz * (3.0 - 2.0 * fz);
    
    let a = hash(ix, iy, iz);
    let b = hash(ix + 1.0, iy, iz);
    let c = hash(ix, iy + 1.0, iz);
    let d = hash(ix + 1.0, iy + 1.0, iz);
    let e = hash(ix, iy, iz + 1.0);
    let f = hash(ix + 1.0, iy, iz + 1.0);
    let g = hash(ix, iy + 1.0, iz + 1.0);
    let h = hash(ix + 1.0, iy + 1.0, iz + 1.0);
    
    let k0 = a;
    let k1 = b - a;
    let k2 = c - a;
    let k3 = e - a;
    let k4 = a - b - c + d;
    let k5 = a - c - e + g;
    let k6 = a - b - e + f;
    let k7 = -a + b + c - d + e - f - g + h;
    
    k0 + k1*u + k2*v + k3*w + k4*u*v + k5*v*w + k6*u*w + k7*u*v*w
}

fn flow_field(x: f32, y: f32, z: f32) -> (f32, f32, f32) {
    let nx = noise3d(x, y, z);
    let ny = noise3d(y + 31.416, z - 47.853, x + 12.721);
    let nz = noise3d(z - 23.314, x + 89.124, y - 11.234);
    (nx, ny, nz)
}

#[wasm_bindgen]
pub struct NeuralEngine {
    node_count: usize,
    max_connections: usize,
    pulse_count: usize,
    connection_dist: f32,

    base_positions: Vec<f32>,
    base_opacities: Vec<f32>,
    base_sizes: Vec<f32>,
    speeds: Vec<f32>,

    live_positions: Vec<f32>,
    live_velocities: Vec<f32>,
    live_opacities: Vec<f32>,
    live_sizes: Vec<f32>,

    conn_positions: Vec<f32>,
    conn_colors: Vec<f32>,
    conn_count: usize,

    pulse_from: Vec<usize>,
    pulse_to: Vec<usize>,
    pulse_progress: Vec<f32>,
    pulse_speed: Vec<f32>,
    pulse_matrices: Vec<f32>,

    color_r: f32,
    color_g: f32,
    color_b: f32,

    elapsed: f32,
}

#[wasm_bindgen]
impl NeuralEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(node_count: usize, max_connections: usize, pulse_count: usize, connection_dist: f32) -> Self {
        let mut seed: u32 = 42;

        let mut base_positions = vec![0.0f32; node_count * 3];
        let mut base_opacities = vec![0.0f32; node_count];
        let mut base_sizes = vec![0.0f32; node_count];
        let mut speeds = vec![0.0f32; node_count];

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
                speeds[idx] = 0.4 + rand_f32(&mut seed) * 1.2;
                idx += 1;
            }
        }
        while idx < node_count {
            let i3 = idx * 3;
            base_positions[i3]     = (rand_f32(&mut seed) - 0.5) * FIELD_SIZE;
            base_positions[i3 + 1] = (rand_f32(&mut seed) - 0.5) * FIELD_SIZE;
            base_positions[i3 + 2] = (rand_f32(&mut seed) - 0.5) * 10.0;
            base_opacities[idx] = 0.5;
            base_sizes[idx] = 0.7;
            speeds[idx] = 0.5 + rand_f32(&mut seed) * 1.0;
            idx += 1;
        }

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
            live_velocities: vec![0.0f32; node_count * 3],
            live_opacities: base_opacities.clone(),
            live_sizes: base_sizes.clone(),

            base_positions,
            base_opacities,
            base_sizes,
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
            color_b: 1.0,

            elapsed: 0.0,
        }
    }

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

        let lerp_rate = 0.04;
        self.color_r += (target_r - self.color_r) * lerp_rate;
        self.color_g += (target_g - self.color_g) * lerp_rate;
        self.color_b += (target_b - self.color_b) * lerp_rate;

        let speed_burst = if transitioning { 5.0 } else { 1.0 };
        let breathe = (t * 0.5).sin() * 0.35;

        // ══════════════════════════════════════════════════════════
        //  1. NODE SIMULATION (Lorenz Storm + Flow Field)
        // ══════════════════════════════════════════════════════════

        for i in 0..self.node_count {
            let i3 = i * 3;
            let mut x = self.live_positions[i3];
            let mut y = self.live_positions[i3 + 1];
            let mut z = self.live_positions[i3 + 2];
            
            let mut vx = self.live_velocities[i3];
            let mut vy = self.live_velocities[i3 + 1];
            let mut vz = self.live_velocities[i3 + 2];
            
            let speed = self.speeds[i];

            // A) Flow Field (Simplex Noise)
            let f_scale = 0.05; // smoother, wider curves
            let (nx, ny, nz) = flow_field(x * f_scale, y * f_scale, z * f_scale + t * 0.05);
            let force_mag = speed * 0.015 * speed_burst; // delicate drift
            vx += nx * force_mag;
            vy += ny * force_mag;
            vz += nz * force_mag;
            
            // B) Lorenz Attractor (Tornado Vortex Core)
            // L'attrattore di Lorenz crea un vortice caotico attorno all'origine
            let l_scale = 0.15;
            let lx = x * l_scale;
            let ly = y * l_scale;
            let lz = z * l_scale + 5.0; // Offset Z to center the butterfly
            
            // Parametri di Lorenz classici modificati per l'estetica
            let sigma = 10.0;
            let rho = 28.0;
            let beta = 8.0 / 3.0;
            
            let dx_lorenz = sigma * (ly - lx);
            let dy_lorenz = lx * (rho - lz) - ly;
            let dz_lorenz = lx * ly - beta * lz;
            
            let lorenz_mag = 0.0001 * speed_burst; // Extremely delicate, just a gentle background pull
            vx += dx_lorenz * lorenz_mag;
            vy += dy_lorenz * lorenz_mag;
            vz += dz_lorenz * lorenz_mag;

            // C) Pointer repulsion (Magnetic push)
            let dx = x - pointer_x;
            let dy = y - pointer_y;
            let dz = z - pointer_z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();

            if dist < 4.5 && dist > 0.001 {
                let norm = 1.0 - dist / 4.5;
                let force = norm * norm * 0.25;
                let inv_dist = 1.0 / dist;
                vx += dx * inv_dist * force;
                vy += dy * inv_dist * force;
                vz += dz * inv_dist * force * 0.5;
            }

            // D) Spring back to base Z plane
            let base_z = self.base_positions[i3 + 2];
            let z_diff = base_z - z;
            vz += z_diff * 0.02;

            // E) Friction & Position Update
            let friction = 0.92; // stronger friction to prevent crazy velocities
            vx *= friction;
            vy *= friction;
            vz *= friction;

            x += vx;
            y += vy;
            z += vz;

            // Toroidal boundary wrapping
            let half_field = FIELD_SIZE * 0.6;
            if x > half_field { x -= half_field * 2.0; }
            if x < -half_field { x += half_field * 2.0; }
            if y > half_field { y -= half_field * 2.0; }
            if y < -half_field { y += half_field * 2.0; }

            // Write back
            self.live_positions[i3] = x;
            self.live_positions[i3 + 1] = y;
            self.live_positions[i3 + 2] = z;
            
            self.live_velocities[i3] = vx;
            self.live_velocities[i3 + 1] = vy;
            self.live_velocities[i3 + 2] = vz;

            // Size/Opacity based on proximity
            let proximity = (1.0 - dist / 6.0).max(0.0);
            self.live_opacities[i] = self.base_opacities[i] + proximity * 0.7;
            self.live_sizes[i] = self.base_sizes[i] * (1.0 + proximity * 1.0);
        }

        // ══════════════════════════════════════════════════════════
        //  2. BOIDS SWARM INTELLIGENCE + CONNECTION BUILDER
        // ══════════════════════════════════════════════════════════

        let conn_dist = self.connection_dist;
        let boids_dist = 1.8; // Raggio in cui le particelle "vedono" i vicini
        let trans_mul = if transitioning { 2.0 } else { 1.0 };
        let mut line_idx = 0usize;

        'outer: for i in 0..self.node_count {
            let ax = self.live_positions[i * 3];
            let ay = self.live_positions[i * 3 + 1];
            let az = self.live_positions[i * 3 + 2];
            
            let avx = self.live_velocities[i * 3];
            let avy = self.live_velocities[i * 3 + 1];
            let avz = self.live_velocities[i * 3 + 2];

            for j in (i + 1)..self.node_count {
                let bx = self.live_positions[j * 3];
                let by = self.live_positions[j * 3 + 1];
                let bz = self.live_positions[j * 3 + 2];

                let dx = ax - bx;
                if dx > conn_dist || dx < -conn_dist { continue; }
                let dy = ay - by;
                if dy > conn_dist || dy < -conn_dist { continue; }
                let dz = az - bz;
                if dz > conn_dist || dz < -conn_dist { continue; }

                let d = (dx * dx + dy * dy + dz * dz).sqrt();
                if d >= conn_dist { continue; }

                // ── BOIDS FORCES (Separation, Alignment, Cohesion) ──
                if d < boids_dist && d > 0.001 {
                    let norm = 1.0 - d / boids_dist;
                    
                    // 1. Separation (avoid crowding)
                    let sep_force = norm * 0.005; // weak separation
                    let idx_force_x = (dx / d) * sep_force;
                    let idx_force_y = (dy / d) * sep_force;
                    let idx_force_z = (dz / d) * sep_force;
                    
                    self.live_velocities[i * 3] += idx_force_x;
                    self.live_velocities[i * 3 + 1] += idx_force_y;
                    self.live_velocities[i * 3 + 2] += idx_force_z;
                    
                    self.live_velocities[j * 3] -= idx_force_x;
                    self.live_velocities[j * 3 + 1] -= idx_force_y;
                    self.live_velocities[j * 3 + 2] -= idx_force_z;

                    // 2. Alignment (match velocities)
                    let bvx = self.live_velocities[j * 3];
                    let bvy = self.live_velocities[j * 3 + 1];
                    let bvz = self.live_velocities[j * 3 + 2];
                    
                    let align_force = 0.001; // subtle alignment
                    let align_dx = (bvx - avx) * align_force;
                    let align_dy = (bvy - avy) * align_force;
                    let align_dz = (bvz - avz) * align_force;
                    
                    self.live_velocities[i * 3] += align_dx;
                    self.live_velocities[i * 3 + 1] += align_dy;
                    self.live_velocities[i * 3 + 2] += align_dz;
                    
                    // 3. Cohesion (move towards center of mass)
                    let coh_force = 0.0005; // very weak cohesion to prevent ugly clumping
                    let coh_dx = -dx * coh_force;
                    let coh_dy = -dy * coh_force;
                    let coh_dz = -dz * coh_force;
                    
                    self.live_velocities[i * 3] += coh_dx;
                    self.live_velocities[i * 3 + 1] += coh_dy;
                    self.live_velocities[i * 3 + 2] += coh_dz;
                }

                // ── CONNECTION RENDERING ──
                if line_idx >= self.max_connections { continue; } // Don't break 'outer so boids keep calculating!

                let alpha = 1.0 - d / conn_dist;
                let mid_x = (ax + bx) * 0.5;
                let mid_y = (ay + by) * 0.5;
                let p_dx = mid_x - pointer_x;
                let p_dy = mid_y - pointer_y;
                let p_dist = (p_dx * p_dx + p_dy * p_dy).sqrt();
                let proximity = (1.0 - p_dist / 4.0).max(0.0);

                let brightness = (alpha * 0.5 + proximity * 1.2) * trans_mul;

                let avg_z = (az + bz) * 0.5;
                let depth_fog = smoothstep(avg_z, -10.0, 4.0);
                let final_bright = brightness * (0.3 + depth_fog * 0.7);

                let i6 = line_idx * 6;
                self.conn_positions[i6]     = ax;
                self.conn_positions[i6 + 1] = ay;
                self.conn_positions[i6 + 2] = az + breathe * 0.2;
                self.conn_positions[i6 + 3] = bx;
                self.conn_positions[i6 + 4] = by;
                self.conn_positions[i6 + 5] = bz + breathe * 0.2;

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

            let m = i * 16;
            self.pulse_matrices[m]      = s;
            self.pulse_matrices[m + 1]  = 0.0;
            self.pulse_matrices[m + 2]  = 0.0;
            self.pulse_matrices[m + 3]  = 0.0;
            self.pulse_matrices[m + 4]  = 0.0;
            self.pulse_matrices[m + 5]  = s;
            self.pulse_matrices[m + 6]  = 0.0;
            self.pulse_matrices[m + 7]  = 0.0;
            self.pulse_matrices[m + 8]  = 0.0;
            self.pulse_matrices[m + 9]  = 0.0;
            self.pulse_matrices[m + 10] = s;
            self.pulse_matrices[m + 11] = 0.0;
            self.pulse_matrices[m + 12] = px;
            self.pulse_matrices[m + 13] = py;
            self.pulse_matrices[m + 14] = pz + breathe * 0.2;
            self.pulse_matrices[m + 15] = 1.0;
        }
    }

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

fn smoothstep(x: f32, edge0: f32, edge1: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
