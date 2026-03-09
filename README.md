# Cosmic Web Explorer


[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18915566.svg)](https://doi.org/10.5281/zenodo.18915566)


[** Live Demo**](https://nicosmo.github.io/cosmic_web_explorer/)


<p align="center">
  <video src="https://github.com/user-attachments/assets/a6712709-7ea4-48f9-bd26-4f384046de06" autoplay loop muted playsinline width="40%"></video>
</p>



**Initial Concept by Simon Bouchard and [Nico Schuster](https://orcid.org/0000-0001-5620-8554) | Development by [Nico Schuster](https://orcid.org/0000-0001-5620-8554)**


A real-time, interactive simulation of the Large-Scale Structure (LSS) of the Universe, running entirely in your browser.

This project visualizes the non-linear evolution of an initial distribution of matter tracers. Watch as primordial fluctuations collapse under the influence of gravity and cosmic expansion to form an intricate network of cosmic voids, filaments, and halos.

The evolution is computed by combining analytical Second-Order Lagrangian Perturbation Theory (2LPT) with a local, quasi-N-body gravity scheme (activated in "Play" mode). The simulation leverages WebGL for high-performance rendering and WebGPU (with a CPU fallback) for parallel physics computations.


> **Note on Physical Accuracy**
> This is a pedagogical and visualization tool. To maintain smooth, interactive performance directly in the browser, the Cosmic Web Explorer is best understood as a "2.5D Universe", a thin slice of a 3D universe projected onto a 2D plane. We make several strict compromises regarding physical accuracy:
> - *Interactions & Forces:* While background expansion $H(z)$, growth factor $D_1(z)$, and transfer functions are rigorously derived from 3D physics, particle interactions occur on a 2D plane. Consequently, the use of a 2D $1/r$ gravitational force sacrifices the realistic formation of dense 3D halos in favor of an accelerated, highly visual network of cosmic filaments.
> - *Resolution Limits:* Low tracer counts (20k - 200k) can cause structural artifacts. Furthermore, local gravitational forces are artificially truncated to maintain interactive framerates.
> - *Phenomenological Models:* True gas hydrodynamics are absent. Collisionless dynamics are approximated via an "Adhesion" model to prevent clusters from visually exploding, and a phenomenological model is implemented to prevent tracers from collapsing into single point masses.

---

## Gallery

## Gallery

| BAO Sculpted Mode | Thermal Gas View |
| :---: | :---: |
| <a href="Examples/BAO_example.png"><img src="Examples/BAO_example.png" width="350"></a> | <a href="Examples/Thermal_example.png"><img src="Examples/Thermal_example.png" width="350"></a> |
| *Evolution from BAO Initial Conditions (ICs).* | *Mimicking local temperature.* |


| Realistic LSS | Void Identification |
| :---: | :---: |
| <a href="Examples/LSS_example.png"><img src="Examples/LSS_example.png" width="350"></a> | <a href="Examples/Voids_example.png"><img src="Examples/Voids_example.png" width="350"></a> |
| *Evolution from Eisenstein & Hu P(k) ICs.* | *Real-time Void Identification.* |

| Tracer Movement | Split-Screen Comparison |
| :---: | :---: |
| <a href="Examples/Trails_example.png"><img src="Examples/Trails_example.png" width="350"></a> | <a href="Examples/Comparison_example.png"><img src="Examples/Comparison_example.png" width="350"></a> |
| *Depict past movement of tracers.* | *Cosmological comparison across two panels.* |


---

## Contributing & Feedback

Contributions, feature suggestions, and bug reports are highly welcome!

* **Issues:** If you have an idea, want to discuss a physics approximation, or found a bug, please open an issue on GitHub.
* **Pull Requests:** If you'd like to contribute code, feel free to fork the repository and submit a Pull Request.

---

## Built With
* **UI & Interactivity:** React 18, TailwindCSS, and Babel (Standalone). Designed with a **zero-build architecture**—running entirely in-browser without Node.js or Webpack.
* **Graphics & Rendering:** Custom WebGL (Shaders) & HTML5 Canvas API.
* **Physics Compute:** WebGPU (Compute Shaders) with a synchronous CPU spatial-hash fallback.
* **Computational Geometry:** d3-delaunay (executed off the main thread in background Web Workers).
* **Video Encoding:** WebCodecs API (Hardware H.264) & ffmpeg.wasm.

---

## Features

### Interactive Simulation & Cosmology
* **Real-Time Evolution:** Watch cosmic structures form from redshift $z=10$ (early universe) to $z=0$ (today) natively in the browser.
* **Configurable Initial Conditions:** Choose between realistic initial conditions (ICs) and BAO-enhanced ICs (details below in the Science section). You can also set the number of tracers (between 20,000 and 200,000) and adjust the field of view (500-3000 Mpc).
* **Cosmology Controls:** Adjust cosmological parameters to immediately observe their impact on structure growth. Supports standard flat/non-flat $\Lambda\text{CDM}$, $w\text{CDM}$, and dynamic dark energy ($w_0w_a\text{CDM}$ via the CPL parameterization).
* **Time Control:** Move backwards and forwards through cosmic history using the timeline slider (instantly computes 2LPT displacements, no local gravity), or hit "Play" for a more accurate evolution.
* **Split-Screen Comparison:** Run two independent simulations side-by-side. Set different cosmological parameters for Panel A and Panel B while sharing the exact same random seed. Panel B syncs to Panel A's redshift ($z$) for direct visual comparisons of structure formation at the exact same stage of cosmic expansion.

### Visualization Modes
* **Tracers & Trails:** View the standard mass tracer distribution, and toggle **History** (past trajectories) or **Vector** (exaggerated current velocity) modes to visualize bulk flows.
* **Thermal (Gas) View:** Approximates gas heating in collapsed structures using additive radial gradients. Colors map to local density ($\text{Blue} \to \text{Cyan} \to \text{White} \to \text{Gold}$), showing gas heating as it falls into clusters.
* **Initial Conditions Overlay:** Highlight the original $z=10$ Lagrangian grid positions to trace bulk flows from their origin.

### Analysis Tools
* **Voronoi Tessellation:** Displays the Voronoi cells of tracers, highlighting underdense regions.
* **Real-Time Void Identification:** Finds cosmic voids using a background Web Worker running a Voronoi-Watershed algorithm (similar to [VIDE](https://ui.adsabs.harvard.edu/abs/2015A%26C.....9....1S/abstract)). Filter void cells by "Color Cutoff," merge them using a "Minimum Radius," and display geometric or minimum-density centers.
* **Void Density Profiles:** Compute and plot the radial density profiles ($\rho(r)/\bar{\rho}$) of identified voids, using either median or volume-weighted stacking.
* **Power Spectrum $P(k)$:** In realistic IC mode, computes the 2D FFT of the evolved density field to display the measured power spectrum.
* **2-Point Correlation:** In BAO mode, evaluates the cross-correlation $\xi(r)$ of tracers around known BAO seeds.
* **Density Distribution:** A real-time normalized histogram of the tracer density contrast ($\delta = \rho/\bar{\rho} - 1$), tracking the shift from linear Gaussian fluctuations to a skewed non-linear distribution.
* **Ruler:** Measure comoving distances (Mpc, assuming $h = 0.674$) directly on the web. *(Interaction: Click to start, click to end, double-click near the start to clear).*

### Interactivity & High-Quality Export
* **Sculpting Mode:** At $z=0$, interact directly with the physics engine. *(Interaction: Click and drag to create manual gravity wells and physically pull filaments).*
* **High-Quality Video Recording:** A deterministic rendering pipeline exports frame-perfect videos regardless of browser lag. Record exactly what you see, or force 720p/1080p. Utilizes hardware WebCodecs (H.264), ffmpeg.wasm, or pure JS WebM assembly.
* **Snapshot Export:** Download high-resolution PNGs of the current visualization, complete with physical HUD overlays detailing the cosmic age and redshift.
* **Data Export (CSV):** Export the exact comoving coordinates (Mpc/h) of all tracers to a CSV file (fully supports simultaneous dual exports in split-screen mode).

---


## Getting Started

Because this project utilizes a **zero-build architecture**, relying entirely on native browser technologies (HTML5, WebGL, WebGPU, Web Workers) and CDN-delivered libraries, there is no `npm install` or complex build pipeline required.

### Prerequisites
* A modern web browser (Chrome, Edge, Firefox, Safari).
* **Recommended:** A browser with WebGPU enabled for parallel physics compute. If WebGPU is unavailable, the simulation will seamlessly fall back to a synchronous CPU spatial-hash implementation.

### Running Locally
To avoid browser cross-origin security restrictions (CORS) when loading Web Workers and local modules, the files must be served over a local HTTP server:

1.  Open your terminal and navigate to the project folder.
2.  Start a local server (e.g., using Python): `python3 -m http.server 8080` (or your preferred local server).
3.  Open `http://localhost:8080` in your browser.

---


## Project Structure

```text
cosmic_web_explorer/
├── index.html              # Main HTML containing the React UI
├── styles.css              # Application styling
├── Examples/               # Demo videos and gallery images
├── src/
│   ├── constants.js          # Cosmological parameters (Planck 2018)
│   ├── cosmology.js          # Expansion history & growth factor LUTs
│   ├── transfer-function.js  # Eisenstein & Hu P(k) transfer functions
│   ├── pert2lpt.js           # 2LPT displacement via 2D FFT
│   ├── sim-physics.js        # Core Leapfrog KDK integration & Adhesion model
│   ├── bao-forces.js         # Sculpted BAO initialization logic
│   ├── gpu-gravity.js        # WebGPU N-body compute shader
│   ├── gpu-correlation.js    # WebGPU pair-counting compute shader
│   ├── sim-renderer.js       # Canvas2D drawing logic for overlays & charts
│   ├── webgl-utils.js        # WebGL rendering for tracers & gas
│   ├── color-luts.js         # Color maps for density/temperature
│   ├── recorder.js           # Multi-pipeline video encoder
│   ├── ui-components.js      # Reusable React UI elements (Tooltips)
│   └── icons.js              # SVG Icons
└── workers/
    └── void-worker.js        # Background void finding (Delaunay/Watershed)
```

---

## The Science

### 1. Cosmological Background

The core of the visualization relies on the background expansion history of a Friedmann-Lemaître-Robertson-Walker (FLRW) universe to dictate the passage of time and the rate of structure formation.

**Expansion History:**
The dimensionless Hubble expansion rate, $E(z) \equiv H(z)/H_0$, governs the cosmic friction and is computed as:

$$
E(z) = \sqrt{\Omega_m (1+z)^3 + \Omega_k (1+z)^2 + \Omega_{DE}(z)}
$$

where $\Omega_k = 1 - \Omega_m - \Omega_\Lambda$. To support dynamic Dark Energy models ($w_0w_a \text{CDM}$), we implement the CPL parameterization:

$$
\Omega_{DE}(z) = \Omega_\Lambda (1+z)^{3(1+w_0+w_a)} \exp\left(-\frac{3 w_a z}{1+z}\right)
$$

**Time & Growth Integration:**
Mapping redshift ($z$) to simulation frames requires calculating Cosmic Time $t(z)$ and the Linear Growth Factor $D_1(z)$, which scales the particle displacements. To maintain interactive framerates without solving these integrals on the fly, the engine pre-computes a 10,000-step Look-Up Table (LUT) for $O(1)$ sampling:

$$
t(z) = \frac{1}{H_0} \int_z^\infty \frac{dz'}{(1+z') E(z')}
$$
$$
D_1(z) \propto E(z) \int_z^\infty \frac{1+z'}{E(z')^3} dz'
$$


### 2. Initial Conditions: Dual Modes

The visualization provides two distinct modes for generating the $z=10$ density field, catering to both visual pedagogy and statistical rigor.

#### 2.1 Rigorous $P(k)$ Mode
For a mathematically accurate representation of primordial fluctuations, we utilize the [Eisenstein & Hu (1998)](https://ui.adsabs.harvard.edu/abs/1998ApJ...496..605E/abstract) transfer function.

* **3D to 2D Projection:** Because the visualization operates on a 2D canvas, the theoretical 3D power spectrum $P_{3D}(k)$ is projected into a 2D slice using an Abel integral to ensure correct statistical clustering properties:

$$
P_{2D}(k_{\perp}) = \frac{1}{2\pi} \int_{-\infty}^{\infty} P_{3D}\left(\sqrt{k_{\perp}^2 + k_z^2}\right) dk_z
$$

* **Gaussian Random Field:** The projected $P_{2D}(k)$ is mapped to a grid in Fourier space, seeded with a Box-Muller Gaussian random distribution, and inverse-FFTed to produce the initial 1LPT Zel'dovich displacement field $\mathbf{\Psi}^{(1)}$.

#### 2.2 Phenomenological "Sculpted" BAO Mode
Because the true BAO signal is statistically weak (~1% contrast) and difficult to isolate by eye in small volumes at low resolution, we provide a sculpted mode designed to explicitly highlight the acoustic scale.

We construct a displacement field $\mathbf{\Psi}(\mathbf{q})$ by superimposing radial Gaussian potential shells around a set of randomized centers $\{ \mathbf{x}_c \}$. This creates clear overdensities at the centers and spherical shells at the BAO scale. Background initial conditions are still generated from the projected power spectrum.

#### 2.3 Second-Order Lagrangian Perturbation Theory (2LPT)
To capture non-Gaussian features, specifically the sharpening of filaments and the rounding of voids, before the N-body relaxation step, we implement 2LPT. The Eulerian position $\mathbf{x}$ of a particle at time $t$ is given by:
$$\mathbf{x}(t) = \mathbf{q} + D_1(t)\mathbf{\Psi}^{(1)}(\mathbf{q}) + D_2(t)\mathbf{\Psi}^{(2)}(\mathbf{q})$$

We assume the standard approximation valid for $\Lambda\text{CDM}$-like cosmologies:
$$D_2(t) \approx -\frac{3}{7} D_1(t)^2$$

**Computation via FFT:** The code calculates the 2nd-order displacement potential $\phi_2$ by solving the Poisson equation on a grid using Fast Fourier Transforms:

$$
\nabla^2 \phi_2 = \phi_{1,xx} \phi_{1,yy} - (\phi_{1,xy})^2
$$

The source term is the determinant of the Hessian of the first-order potential. The 2LPT displacement is then the gradient of this potential: $\mathbf{\Psi}^{(2)} = - \nabla \phi^{(2)}$.


### 3. Dynamics: Quasi-N-Body and Adhesion

To achieve interactive framerates and stable structures in 2D, we use a hybrid approach that modifies standard N-body dynamics.

**The "Adhesion" Model (Cluster Physics)**
In high-density regions, purely LPT-driven trajectories cross and blow up (shell-crossing). Rather than implementing a computationally expensive Burgers-equation viscosity model, we use a phenomenological adhesion model. We track a "shell-crossing accumulator" $N_{cross}$ for each particle, which increments when nearby particles have anti-parallel displacement directions:

$$
\mathbf{\Psi}_{1,i} \cdot \mathbf{\Psi}_{1,j} < 0 , 
$$

indicating converging flows. The effective linear growth factor for that particle is locally damped:

$$
D_{\mathrm{eff}}^{(i)}(t) = \frac{D_1(t)}{1 + \alpha \cdot N_{cross}^{(i)}}
$$

This effectively "freezes" the expansion of the displacement field in high-density regions, mimicking the formation of stable, virialized structures. To prevent spurious damping in underdense regions, crossing events are only accumulated where the local density exceeds $2 \cdot \bar{\rho}$.

**Local Gravity and Integration**
We add short-range forces using a Grid-based Particle-Particle method with a Plummer-softened $1/r$ force law (2D Newtonian gravity):

$$
\mathbf{F}_{ij} = G_{\mathrm{eff}} \cdot \frac{\mathbf{d}_{ij}}{|\mathbf{d}_{ij}|^2 + \varepsilon^2}
$$

The coupling constant $G_{\mathrm{eff}}$ heuristically scales with the dimensionless linear growth rate $f(a) \approx \Omega_m(a)^{0.55}$ ([Linder 2005](https://ui.adsabs.harvard.edu/abs/2005PhRvD..72d3529L/abstract)) to ensure clustering visually freezes out as Dark Energy dominates:
$$G_{\mathrm{eff}} = G_{\mathrm{base}} \cdot \Omega_m(a)^{0.55} \cdot \frac{\Delta t}{\Delta t_{\mathrm{ref}}} \cdot \frac{N_{\mathrm{ref}}}{N}$$

Integration is handled via a Leapfrog KDK (Kick-Drift-Kick) scheme. The comoving friction term applied during the drift step is:

$$
\mathbf{v} \leftarrow \mathbf{v} \cdot \exp \left(-2 \, E(z) \cdot C_{\mathrm{drag}} \cdot \frac{H_0 t_0}{(H_0 t_0)_{\mathrm{ref}}} \cdot \frac{\Delta t}{\Delta t_{\mathrm{ref}}}\right)
$$

where $C_{\mathrm{drag}} = 0.25$ is empirically calibrated above the pure physical value to account for unresolved sub-grid velocity dispersion damping.


### 4. Implementation: CPU vs. WebGPU

The physics engine includes two gravity backends to ensure high performance across devices:

| Feature | CPU Mode | GPU Mode (WebGPU) |
| :--- | :--- | :--- |
| **Technique** | Spatial Hash Grid | Compute Shaders |
| **Search Pattern** | $3 \times 3$ Grid Cells | Circular Radius ($r \le 4$) |
| **Cells Searched** | 9 | ~49 ($x^2 + y^2 \le 16$) |
| **Pipeline** | Synchronous | Asynchronous (Double-buffered) |

**GPU Async Pipeline:** During live playback, the WebGPU compute shader uses asynchronous readback with double-buffered staging to eliminate pipeline stalls. Frame $N$ dispatches the compute pass while simultaneously reading back the result of Frame $N-1$, introducing a negligible 1-frame latency. During video recording, the pipeline automatically switches to synchronous mode to ensure frame-perfect, deterministic results.


### 5. Void Finding & Structural Analysis

Real-time void identification is offloaded to a background Web Worker. The engine implements a methodology heavily inspired by standard cosmological tools like [ZOBOV](https://ui.adsabs.harvard.edu/abs/2008MNRAS.386.2101N/abstract) and [VIDE](https://ui.adsabs.harvard.edu/abs/2015A%26C.....9....1S/abstract).

* **Density Estimation (VTFE):** The simulation computes the Delaunay triangulation and corresponding Voronoi cells for all tracers. Local density is estimated via the inverse cell area: $\rho_i = \overline{A}/A_i$, where $\rho = 1$ is the mean density and $\overline{A}$ the mean cell size.
* **Watershed Algorithm:** The field is segmented by finding local density minima. Adjacent cells flow "downhill" into these minima, grouping the universe into distinct void basins.
* **Automatic Ridge Merging:** The algorithm analyzes the shared boundary (ridges) between adjacent voids. If more than 20% of a shared boundary (and at least 4 cell pairs in absolute count) consist of walls with a density below the cosmic mean, the voids are merged. This prevents artificial fragmentation caused by Poisson noise.
* **Additional Merging:** Small voids ($R < R_{min}$) can be iteratively absorbed into their largest neighboring void. All topological calculations respect periodic boundaries using a wrapped "ghost particle" buffer.


### 6. Display-Time Thermal Scatter

To represent the sub-grid velocity dispersion (virialization) of dark matter halos without the computational cost of true high-resolution N-body orbits, the engine applies a physically-modulated cosmetic offset at render time. The scatter amplitude is driven by five factors:

* **Density-Dependent Amplitude:** The amplitude approaches a baseline in voids and is suppressed in dense structures:
  
$$
\sigma \propto \frac{1}{1 + \alpha (\rho / \bar{\rho})}
$$

* **Anisotropic Elongation:** The scatter is stretched along the local 1LPT force vector to mimic particles streaming along filaments.
* **Growth-Rate Scaling:** Scaled by $f(a)^{0.5}$, where $f(a) \approx \Omega_m(a)^{0.55}$, to represent the thermalization of kinetic energy at late cosmic times.
* **Shell-Crossing Weighting:** The dispersion is boosted in multi-stream regions to visually represent areas where violent relaxation has occurred.
* **Coherent Persistent Phases:** The random offsets are derived via a precomputed sin/cos table based on a persistent phase angle, ensuring smooth orbital drift rather than jarring frame-to-frame noise.




---


## References / Bibliography

* **Eisenstein, D. J., & Hu, W. (1998).** *Baryonic Features in the Matter Transfer Function.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/1998ApJ...496..605E/abstract)
  > Used to generate the rigorous 3D $P(k)$ initial conditions.
* **Chevallier, M., & Polarski, D. (2001).** *Accelerating universes with scaling dark matter.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2001IJMPD..10..213C)
  > Basis for the dynamic Dark Energy ($w_0w_a$CDM) parameterization.
* **Linder, E. V. (2005).** *Cosmic growth history and expansion history.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2005PhRvD..72d3529L/abstract)
  > Used for scaling the effective gravitational coupling constant $G_{\mathrm{eff}}$.
* **Neyrinck, M. C. (2008).** *ZOBOV: a parameter-free void-finding algorithm.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2008MNRAS.386.2101N/abstract)
  > Theoretical basis for the Voronoi Tessellation Field Estimator (VTFE) and Watershed segmentation.
* **Sutter, P. M., et al. (2015).** *VIDE: The Void IDentification and Examination toolkit.* [NASA ADS](https://ui.adsabs.harvard.edu/abs/2015A%26C.....9....1S/abstract)
  > Guided the void identification.


---


## Acknowledgments

* **Initial Concept:** Simon Bouchard and Nico Schuster
* **Development:** Nico Schuster
* **Code Generation:** Google Gemini Pro 3.0/3.1 and Claude Opus 4.5/4.6
* **Core Libraries:** The void-finding visualization heavily relies on the excellent [d3-delaunay](https://github.com/d3/d3-delaunay) library for computational geometry.

The authors of this code thank Julian Bautista, Nico Hamaus, Geray Karademir, Alice Pisani, and Julien Zoubian for useful discussions. NS is supported by the French government’s France 2030 investment plan (A*MIDEX AMX-22-CEI-03).


## Citation

If you use the Cosmic Web Explorer in your pedagogical materials, presentations, or research, please cite it using the Zenodo DOI:

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18915566.svg)](https://doi.org/10.5281/zenodo.18915566)

```bibtex
@software{Schuster_CosmicWebExplorer_2026,
  author       = {Schuster, Nico and Bouchard, Simon},
  title        = {Cosmic Web Explorer: Real-Time Large-Scale Structure in the Browser},
  month        = mar,
  year         = 2026,
  publisher    = {Zenodo},
  version      = {v1.0.0},
  doi          = {10.5281/zenodo.18915566},
  url          = {https://doi.org/10.5281/zenodo.18915566}
}
```



## License & Open Science

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**. 

We chose this license not to be restrictive, but to ensure that the **Cosmic Web Explorer** remains a permanent, free resource for the astronomy community. By using the AGPLv3, we guarantee that:
* **Open Access:** The code will always stay open-source.
* **Shared Improvements:** If you improve the physics or the UI, those improvements stay within the community for everyone to benefit from.
* **Attribution:** Your hard work (and ours) is protected. Original credits must always remain intact.

**In short:** Feel free to fork it, break it, and build something better, just keep the lights on for the next person!







