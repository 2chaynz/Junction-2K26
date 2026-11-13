# Decision

_Decided Fri 13 Nov. Brief: `context/challenges/intel.md`._

- **Challenge:** Ignite Next x Intel, Physical AI Challenge (Hardware track).
- **Idea:** Autonomous inspection cell. An SO-101 arm picks each Duplo brick, shows it to the inspection camera and drops it into a "good" or "defective" bowl. No human in the loop.
- **One-line pitch:** A factory inspection robot taught by demonstration in one weekend, not programmed, running fully on a laptop.
- **Demo flow:**
  1. Pile of mixed bricks, some marked defective.
  2. Arm picks a brick, holds it at the inspection camera, live anomaly score on screen.
  3. Brick lands in the right bowl. Repeat until the pile is empty; show cycle time and accuracy.
- **In scope:**
  - Teleop demos with the leader arm, recorded as a dataset.
  - VLA policy fine-tuned in Physical AI Studio on cloud GPUs.
  - Anomalib good/defective model at the inspection point.
  - Both models optimized with OpenVINO, running on the Intel laptop (CPU/GPU/NPU).
  - Orchestration loop: pick → inspect → place, with a simple live status screen.
- **Stretch (only after the full loop works):** faster cycles, messier piles, new defect types.
- **Out of scope:** custom hardware, cloud inference at demo time, other challenges.
- **Why this one:** Largest cash pool (€5k/3k/2k). Clear, finishable task with a station provided. Uses the team's embedded and data skills.
- **Open:** judging criteria not in the brief; ask at the Intel booth.
