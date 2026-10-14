---
title: "A Fly Connectome, a Decision API, and the Bugs Between Them"
date: "2026-10-08"
draft: false
description: "An engineering story about neural simulation, circuit ablations, benchmark traps, and a surprisingly competitive if statement."
tags: [python, machinelearning, testing, opensource]
---

A hungry agent encounters food. Something moves overhead. It has three buttons:

```text
EAT     ESCAPE     IDLE
```

We wanted to compare two very different ways of pressing those buttons: a spiking simulation built from a fruit fly's neural wiring, and Jev, a decision model accessed through TypeSafe AI's API.

That became **Flight or Bite**.

The comparison produced a clear result in our chosen environment: Jev survived longer. It also produced a less convenient result: a short `if` statement was competitive with Jev.

But the most interesting work happened before the leaderboard. We had to distinguish a simulator bug from a decoder bug, excessive sensory drive from network behavior, and an ineffective ablation from a pathway our own input mechanism had bypassed.

This is the story of those distinctions.

## Three buttons, four inputs, one expensive mistake

The environment is a sequence of abstract trials. Each controller, which we call an *arbiter*, observes four numbers between zero and one:

- `sugar`: a food cue.
- `bitter`: a toxicity cue.
- `looming`: a noisy threat cue.
- `hunger`: the agent's current energy deficit.

Eating can restore energy or expose the agent to poison. Escaping costs energy. Every trial also consumes energy through metabolism. A real threat can kill an agent that eats or idles.

The objective is mean lifetime: how many trials the agent completes alive, capped at 500. There is no body, navigation, or continuous visual scene.

<figure class="essay-visual diagram-scroll natural-size">

![Trial environment: observations go to an arbiter, actions update threat outcomes and energy, and surviving agents continue to the next trial.](/images/posts/flight-or-bite/trial-environment.svg)

</figure>

We asked three questions. Does the simulated wiring produce interactions between feeding and escape pathways? How well does that behavior survive against an API arbiter and simple baselines? And how long does each implementation take to decide?

For paired comparisons, each arbiter receives the same precomputed environmental randomness for a given seed. Its actions still change its energy, so hunger trajectories can diverge. Pairing the world does not make the agents' complete observation histories identical.

## A connectome needs an adapter

Our graph contains **138,639 neurons and 15,091,983 aggregated directed edges**, from FlyWire v783. Those edges are connections between neuron pairs, not a count of individual synapses.

Our dynamics follow [Shiu and colleagues' reference model](https://github.com/philshiu/Drosophila_brain_model/tree/91bdd1e7dc). We simulated the graph with leaky integrate-and-fire neurons: incoming spikes change a neuron's state, that state decays, and crossing a threshold causes a spike and reset. There was no backpropagation, reinforcement learning, or learned readout in this experiment.

The wiring did not specify how our four numbers should enter the network or how network activity should press a button. We supplied those interfaces:

- Sugar and bitter drive designated sensory neurons.
- Looming directly drives LPLC2 and LC4 neurons, bypassing the retina.
- Hunger increases sugar input gain.
- Four spikes from the MN9 feeding readout within a trailing 50 ms window trigger `EAT`.
- One spike from either DNp01 escape readout triggers `ESCAPE`.

The first qualifying event wins; an exact tie goes to escape. No event within 500 ms of simulated time means idle.

These are engineering choices. In particular, the four-spike feeding threshold is our criterion, not a measured universal threshold for a fly deciding to eat. We recorded such choices in an [engineered-assumptions register](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/docs/ENGINEERED.md).

That adapter became one of the main characters in the investigation.

## First, make the simulator agree with itself

Running the full graph repeatedly needed an efficient backend. We used an event backend implemented with NumPy and Numba, retaining the full graph while updating the active set. Neurons at exact rest stay at rest until activity reaches them.

Efficiency introduced a verification problem: were we still executing the same dynamics as the Brian2 reference?

A matching final button would have been weak evidence. Thousands of incorrect internal events could still end in `ESCAPE`.

Instead, we replayed the reference simulator's stimulated-neuron spike trains into the event backend and compared **every network spike as a `(neuron, timestep)` pair**. Sharing an RNG seed would not have been enough: the two input generators consume randomness differently.

<figure class="essay-visual diagram-scroll natural-size">

![Simulator cross-check: recorded Brian2 input spikes are replayed in the event backend; network spike traces, decoded actions, and decision times are compared.](/images/posts/flight-or-bite/simulator-crosscheck.svg)

</figure>

The conflict check used simultaneous sugar and looming input, ten seeds, and a 0.1 ms timestep. After the decoder fix described next, **26,502 of 26,502 spikes matched**, and all ten decoded decisions and times matched exactly.

That checked details with real consequences: operation order within a timestep, synaptic delay, refractory behavior, and reset. Inputs reaching refractory targets are dropped; reset clears the firing neuron's state. Moving an operation can change later spikes.

This established implementation agreement for the tested model and inputs. It did not establish biological fidelity, nor did this replay check validate every extension, such as the ablation mechanism. The [cross-check report](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/crosscheck_brian2.md) spells out that boundary.

## The bug hiding inside 50 milliseconds

One simulator represented a decision time as `39.2`. The other represented the same timestep as `39.199999999999996`.

Initially this looked like serialization noise. But the feeding decoder compared spike intervals in floating-point milliseconds. A burst spanning exactly 50 ms could fall on either side of the comparison because of rounding.

The intended window was `(t - 50 ms, t]`: exclude the left boundary, include the current spike. At a 0.1 ms timestep, four spikes qualify only when the first and last are **fewer than 500 ticks apart**.

The fix was to use the simulator's discrete clock. This is the essential logic, specialized to the four-spike criterion:

```python
# spike_t_ms contains the MN9 spike times; np is NumPy.
steps = np.sort(np.rint(spike_t_ms / 0.1).astype(np.int64))
if len(steps) >= 4:
    spans = steps[3:] - steps[:-3]
    qualifying_bursts = np.flatnonzero(spans < 500)
```

Now the boundary means the same thing in both backends.

There is an audit detail worth preserving: the earlier M3 validity gates were not rerun after this fix. Their raw “DNp01 spiked” outcomes are unaffected; feeding outcomes could change for bursts exactly on the 50 ms boundary. The post-fix cross-check and later confirmatory run provide separate evidence.

The lesson travels well beyond neuroscience: if the underlying system has a discrete clock, express boundary-sensitive decisions in that clock.

## Then test the pathways separately

Yes, we tested individual pathways. We applied isolated stimuli and observed named readouts while continuing to simulate the full graph.

Sugar should increase MN9 activity. Bitter should suppress the feeding response to sugar. Looming should increase the escape response. Before interpreting simultaneous stimuli, each input needed a usable operating range.

Silencing MN9 removed decoded feeding, and silencing both DNp01 neurons removed decoded escape. These were useful readout sanity checks, although those outcomes follow from how we defined the decoder.

The initial looming encoding failed that practical requirement. Driving all **314 LPLC2 and LC4 neurons** with the provisional maximum rate of 200 Hz made every tested nonzero looming level trigger escape responses. The response was effectively saturated.

We calibrated sugar and looming separately on development seeds, using a predefined anchor: at stimulus 0.5, with other inputs silent and hunger zero, the corresponding response should occur with probability 0.5.

The resulting maximum rates were:

| Channel | Maximum input rate |
|---|---:|
| Sugar | 102.783 Hz |
| Looming | 2.344 Hz |

The looming rate was roughly **44 times smaller**. The same number of hertz did not represent a comparable stimulus across the two pathways.

Independent development seeds verified the 0.5 response anchor for both channels. Bitter inherited the sugar rate rather than receiving its own calibration. Hunger modulation subsequently moves the feeding operating point. These qualifications matter when interpreting what the calibration achieved. See the [calibration record](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/calibration.md).

## The ablation that exposed our input boundary

With isolated responses working, we could ask a more interesting question: when food and danger appear together, does feeding input change the escape pathway itself?

We held looming input randomness fixed across paired trials and added sugar. In the later confirmatory test at looming 0.8, DNp01 spiked in **92 of 100 trials without sugar**, versus **54 of 100 with sugar 0.6**.

This measures escape-neuron activity, not merely which action won the decoder race. Feeding input was changing the escape response inside the model.

We then tested a candidate group of 25 inhibitory neurons, called `M_loom`. The group was identified during exploration and fixed before confirmatory testing. Silencing it removed the net suppression in the earlier gate experiment; the later confirmatory ablation supported the same mechanism.

One individual candidate, **cL20**, was especially revealing. Silencing it alone did not remove the effect.

Its relevant outgoing connections largely targeted LC4 and LPLC2. Those were precisely the neurons we had turned into externally driven spike sources: each input event forced a spike regardless of inhibition.

Our stimulus injection bypassed the inhibition we were trying to inspect along that route.

<figure class="essay-visual diagram-scroll natural-size">

![Modeling boundary: external looming events force LC4 and LPLC2 spikes, bypassing inhibition from cL20 before the downstream DNp01 escape readout.](/images/posts/flight-or-bite/forced-input-boundary.svg)

</figure>

This is a schematic of the modeling boundary, not a complete anatomical circuit diagram.

A separate check compared **17,916 input-neuron spikes across 60 paired trials** and found no sugar/no-sugar differences. Silencing the other 24 members of `M_loom`, while leaving cL20 intact, removed the net suppression.

For a software engineer, this resembles a test double that always returns a canned result while the test is supposed to exercise a dependency's response to changing state.

The justified conclusion is narrow: this cL20 route cannot explain the effect under our forced-input implementation. It says nothing decisive about cL20's role in a living fly. The [gate and ablation report](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/gates.md) contains the paired results.

## We also had to debug the benchmark

Another problem appeared before the final protocol was frozen.

We initially considered tabulating each policy on a grid, interpolating between nodes, and sampling an action. This would make repeated evaluation cheaper.

To test the harness, we put a known model-based oracle through it. In that **earlier development environment**, direct execution averaged **151.2 trials**. A 225-node table averaged **60.1**.

The table reproduced the policy exactly at its nodes. Between nodes, interpolating neighboring one-hot decisions created mixtures of actions. Sampling those mixtures changed the policy, especially near sharp decision boundaries.

The optimization preserved pointwise tests while destroying much of the behavior we intended to measure. These early numbers use different environment settings from the final study; they are not another run of the final leaderboard.

We made the primary comparison online, using each arbiter's native action, before freezing the test protocol. Tables remained useful for secondary analyses. The [grid-loss experiment](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/grid_loss.md) documents why.

## Give the API arbiter the rules

Jev also needed an adapter: observations, action descriptions, instructions, and a choice about which response field to execute.

Before the test, we compared four predefined modes on the same 50 development seeds. Numeric observations without the rules package averaged **25.98 trials**. Numeric observations with the rules package averaged **64.26**. A bucketed, informed version was nearly tied at **64.20**.

The package included both instructions and criteria descriptions, so this was not an isolated experiment on one prompt sentence. We selected the highest-mean mode, `informed`, using the previously specified rule. The small lead over informed bucketed input did not establish a significant difference.

This also defines the fairness boundary: Jev received an explicit account of the task, while the connectome simulation received engineered sensory input. They shared an action interface, not identical prior knowledge. See the [mode-selection report](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/jev_mode_selection.md).

## The leaderboard, and the if statement

The primary evaluation used **300 paired seeds, five arbiters, and no decision deadline**. Hypotheses, configurations, and analysis criteria were frozen before test evaluation.

| Arbiter | Mean completed trials |
|---|---:|
| Model-based oracle | 73.81 |
| Fixed-priority rule | 56.66 |
| Jev, informed | 55.39 |
| LIF connectome simulation | 23.90 |
| Random | 14.14 |

Jev's paired advantage over the connectome was **31.49 trials**, with a 95% bootstrap confidence interval of **[28.06, 34.91]**. It won the preregistered comparison.

Then there was this baseline, shown here without its interface boilerplate:

```python
def choose(sugar, bitter, looming):
    if looming > 0.5:
        return "ESCAPE"
    if sugar > 0 and bitter < 0.3:
        return "EAT"
    return "IDLE"
```

Its descriptive advantage over Jev was **1.27 trials**, with a confidence interval of **[-3.32, 5.87]**. We did not demonstrate a significant difference. That is not proof of equivalence, but it substantially limits any grand interpretation of Jev's win.

The oracle is also a qualified reference: it uses known environment dynamics and a policy derived by finite-horizon dynamic programming, applied stationarily because the arbiter interface has no trial index. It does not observe the hidden threat directly or establish a universal performance ceiling.

The failure modes add texture. Predators caused 98% of connectome deaths. Jev mostly died of starvation: 76%, versus 22% from predators. Its frequent escapes avoided danger while consuming energy and passing up feeding opportunities.

All of these findings concern this environment and these implementations. The [complete report](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/final_report.md) includes intervals, action frequencies, and confirmatory circuit tests.

## A probability vector is another policy decision

For the primary run, Jev acted using its returned `choice`. We separately evaluated sampling from its returned `probabilities`.

In that secondary run of **100 paired seeds**, Jev averaged **29.97 trials**, versus **24.06** for the connectome: a paired advantage of **5.91 [0.63, 11.03]**.

The secondary run has fewer seeds than the primary run, so subtracting their headline means is not a clean estimate of a sampling effect. It nevertheless makes the integration question concrete: executing the selected action and drawing from the probability vector define different behaviors. The secondary result does not replace the primary comparison.

In an environment where one exploratory action can be fatal, that distinction deserves an explicit decision in the client code.

## The stopwatch measures a deployment

The connectome simulation ran locally on a **16-inch MacBook Pro (November 2023), with an Apple M3 Pro chip and 36 GB of unified memory**. The system screenshot supplied by the author shows **macOS Sequoia 15.7.9**. Jev ran remotely through its API.

We measured latency separately, with 20 warm-up calls per Jev mode and 1,000 timed decisions per arbiter or mode. The benchmarks ran from a normal terminal on AC power.

| Implementation | Median wall time | p95 |
|---|---:|---:|
| Local connectome simulation | 54.4 ms | 262.9 ms |
| Jev informed through OpenRouter | 354.7 ms | 479.1 ms |
| Jev informed through direct TypeSafe API | 304.8 ms | 408.8 ms |

The direct informed median was about **14.1% lower**. We preserved the OpenRouter measurements and stored the direct benchmark separately.

These were separate runs at different times. OpenRouter reported `typesafe/jev-1.13-20260917`; the direct API reported `jev-1.13.0`. We did not verify that those identifiers resolved to identical model snapshots, so we cannot attribute the entire difference to the intermediary. The [direct comparison](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/reports/latency_typesafe/comparison.md) retains that provenance.

Local runtime, network-inclusive API time, and simulated neural time are three different measurements. None of these wall-time numbers is a living fly's reaction time. And because the primary survival experiment imposed no deadline, the simulation's faster local response did not earn a survival advantage there.

## What remained after the comparison

One validity gate failed: only **9 of 11 parameter variants** retained the required behavior. Halving sugar drive prevented the feeding criterion from being reached; halving synaptic strength silenced the measured readouts. We kept the original thresholds and recorded the failure.

**Conclusions depend on manually chosen parameters.**

That sentence belongs next to the results. The graph mattered: degree- and sign-preserving shuffles lost the readout responses under the same encoding. But structure alone did not determine behavior; input gains, dynamics, and output criteria mattered too.

For future experiments, the strongest lessons are practical:

- Compare internal traces when validating an optimized simulator.
- Test isolated pathways before interpreting their interactions.
- Check whether the stimulus mechanism overrides the mechanism an ablation is meant to test.
- Run known policies through the evaluation harness before trusting its rankings.
- Include simple baselines and make action-selection semantics explicit.
- Keep decision quality, simulated time, and deployment latency separate.

We began with a fly's wiring and an API competing over three buttons. We ended with a clearer account of what each layer contributed to the result—and several examples of how easily those layers could be mistaken for the intelligence of the whole system.

The code, reports, and tracked results are in [Flight or Bite on GitHub](https://github.com/ediskandarov/flight-or-bite). The [preregistration](https://github.com/ediskandarov/flight-or-bite/blob/23f94d2/PREREG.md) preserves the study's commitments; its post-study English translation is explicitly disclosed. The README explains reproduction requirements, including which original run artifacts are not part of a fresh checkout.

I led and coordinated this project, working closely with AI agents throughout the research and development. The agents—Anthropic Fable and OpenAI Astra—performed the research and coding and drafted this article, with my active involvement in developing its content.
