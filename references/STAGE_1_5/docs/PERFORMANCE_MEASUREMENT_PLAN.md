# Stage 1.5 Performance Measurement Plan

Record a baseline before any changes and compare after each major prompt.

## Capture
- target desktop browser and named test hardware (CPU, GPU, RAM, browser, resolution);
- FPS and frame time (average, 1% low, worst spikes);
- GPU / CPU frame time where available;
- draw calls, rendered triangles, visible objects and shadow casters;
- texture count, decoded texture memory and compressed download size;
- geometry / GLB download size and initial load time;
- JavaScript bundle size and stage asset download size;
- browser memory where available;
- network RTT, server tick rate, state-sync rate, dropped / late messages;
- results with 1, 10, 20 and 30 connected clients, including 30 visible contestants.

## Optimization priority
1. Remove unnecessary distant tree and background geometry via matte painting / cutouts.
2. Reduce repeated material slots and use atlases.
3. Instance repeated static props.
4. Add environment and character LODs where visual quality permits.
5. Compress meshes and textures with pipeline-supported formats.
6. Reduce shadow map count, shadow distance and dynamic light overlap.
7. Limit blended transparent effects and particle count.
8. Stream / lazy-load content where practical.
9. Profile the 30-character scene and The Watcher together.
10. Retest visual quality after every reduction.

## Reporting
Do not claim “optimized” or “supports 30 players” without actual measurements. Report the baseline, changes, final results, hardware and known bottlenecks. Suggested performance targets are provisional and must be agreed after baseline testing.
