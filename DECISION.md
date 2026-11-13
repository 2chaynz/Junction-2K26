# Decision

Decided Fri 13 Nov 2026, ~21:30.

- **Challenge:** Intel Physical AI (Ignite Next x Intel), track Hardware. Brief: `context/challenges/intel.md`.
- **Side project:** Bahn Express Spread (owner: 2chaynz, agents, OR-Tools). Separate submission.
- **Idea:** autonomous brick inspection cell. SO-101 arm picks each Duplo brick, shows it to the inspection camera, drops it in the good or defective bowl. Models run on the Core Ultra laptop via OpenVINO.
- **One-line pitch:** _TBD_
- **Demo flow:** 1. Mixed brick pile. 2. Arm sorts fully autonomously, live. 3. Show cycle time, latency, CPU/GPU/NPU split. 4. Messy pile or new defect type as the twist.
- **In scope:** teleop demos, VLA fine-tune (Physical AI Studio), Anomalib defect model, OpenVINO deployment on CPU/GPU/NPU, clean dataset.
- **Out of scope:** anything not on the SO-101 station. Fancy UI.
- **Why this one:** fits the team's embedded and data/backend skills. Biggest pool (EUR 5k/3k/2k). Only 25 stations, so a small field. Physical demo reads well at peer review.

## Judging (Intel, from the platform)
| Criterion | Weight |
|---|---|
| Task success (accuracy, cycle time, robustness to shifted or cluttered bricks) | 30% |
| Intel technology integration (OpenVINO Physical AI, Robotics AI Suite, NPU and iGPU offload) | 30% |
| Dataset and pipeline quality (clean teleop data, Physical AI Studio fine-tune) | 20% |
| System efficiency (inference latency, thermal headroom, power) | 20% |

## Open
- Does our team have a station? Confirm at the Intel / Ignite Next booth or the Hardware Lab (5F).
- Intel workshop Sat 12:00, HW Lab 5F.
