---
title: "I Made DOOM Run Inside the Ethereum Virtual Machine. Then I Tried to Play It."
description: "Porting DOOM's gameplay and software renderer to the EVM, investigating native memory behavior, and trying to play the result."
date: "2026-10-14"
draft: false
tags: [engineering, ethereum, doom]
---

DOOM inside the Ethereum Virtual Machine was painfully slow. I would give it an input, wait for the transaction, and see what the game had done. It was an awkward way to play a fast shooter, but I was thrilled that it responded at all. I kept going, exploring what worked and how far I could get.

At one point I punched a monster. In the screenshot, the browser shows my outstretched fist and blood across the foreground, with `Transaction reverted` beneath the game. Above it, the page still says, “It runs. In a transaction.”

<figure class="essay-visual media" id="PUNCH_REVERT">

![The cropped browser view shows a fist and blood in Freedoom E1M1, with Transaction reverted below the game.](/media/posts/doom-on-evm/PUNCH_REVERT.png)

<figcaption>

*Freedoom E1M1 during the exploratory session. This is the last successful frame; the failed transaction produced no replacement image. Artwork and maps by the [Freedoom contributors][freedoom-credits] ([BSD notice][freedoom-notice]).*

</figcaption>
</figure>

That distinction turned out to matter. The screenshot showed part of the sequence leading up to the failure, not the operation that failed. The recovered command didn't even have the attack button held. The fist was a useful clue, but it wasn't a stack trace.

The [transaction receipts][blood] ruled out an exhausted gas allowance. The error came from a bounds check in the renderer. Something in the original drawing calculation wanted a byte that the Solidity port could not account for. Finding out where that byte belonged required going rather further back than the monster.

## I wanted the renderer, too

The original idea was the familiar DOOM question applied to an execution environment I wanted to try: could it run inside the EVM? I directed the work with GPT-6.1 Sol and GPT-6 Astra through Codex, setting constraints, making decisions and reviewing results. The agents implemented substantial parts of the engine, investigated failures, wrote tests, verified results and integrated features. “We” means that collaboration. “I” is the person who kept asking it to do more, and eventually tried to play the result.

From the first recorded development work on Friday, October 9, 2026, we reached the nine standalone Episode One recordings by Sunday. The public-release merge followed on Monday.

The port now contains over 22,000 lines of Solidity. I used Codex agents working in parallel, with some delegating parts of their work to other agents. There were 44 agent sessions in total.

The EVM is the machine that ordinarily executes Ethereum smart contracts. Solidity compiles into instructions for it. Nothing about that makes Solidity an attractive language for a shooter; it made it the language of this experiment. I wanted the game's calculations to happen there, including the choice of every pixel in the picture.

That still left a useful choice of target. Public Ethereum imposes constraints that make this a very different proposition from running a local experiment. I was happy to use Anvil, a local Ethereum development node, with relaxed gas, code-size and memory limits. Gas is the EVM's accounting for execution work. Here, a high gas bill was a measurement, rather than a payment to a public network. The instruction set remained ordinary EVM; there was no special instruction that handed DOOM off to a native engine. This did not establish Mainnet deployability.

Once that boundary was clear, I wanted to follow the actual engine. DOOM offered both recognizable behavior and released C source against which to check it. The reference was a pinned revision of `linuxdoom-1.10`, from the later released source lineage of the 1993 game. I also wanted the port to be readable beside it: the C renderer's `r_bsp.c` should have a recognizable counterpart in `r_bsp.sol`, with corresponding functions and control flow. Source-level correspondence was one of the [original requirements][decisions].

That requirement affected mundane decisions as well as the large ones. The port kept the original lookup tables, the order of random-number calls, and the arithmetic used to move and draw things. Where C pointers or global variables needed another representation, the adaptation had to be explicit. A picture that looked plausible would be a beginning; it would not tell us whether the original calculation had survived.

The engine also needed a world. DOOM stores maps, textures, sprites and other resources in WAD files. Early work used Freedoom, a freely distributable set of maps and artwork for a DOOM-compatible engine. Its E1M1 is a different map from id Software's E1M1. The browser could prepare those resources and deploy authenticated, immutable contract-code chunks, which the EVM reads through `EXTCODECOPY`. Preparing an archive did not include deciding which walls were visible or drawing them.

<figure class="essay-visual diagram" id="EVM_ARCHITECTURE">

<div class="diagram-scroll" tabindex="0" role="region" aria-label="Evm Architecture diagram">
  <a href="/images/posts/doom-on-evm/EVM_ARCHITECTURE.svg" aria-label="Open full-size diagram"><img src="/images/posts/doom-on-evm/EVM_ARCHITECTURE.svg" alt="Browser input and installed WAD resources feed EVM gameplay and software rendering. Frame and FramePalette events return chosen pixels to browser Canvas." loading="lazy"></a>
</div>

<figcaption>

*The [production path for rendered input][architecture]: inputs go in, EVM-generated pixels come out. The browser prepares resources and presents the result. Native C belongs to the separate verification path.*

</figcaption>
</figure>

This made the browser a fairly literal window onto a transaction. If execution succeeded, it could display the emitted picture. If execution reverted, there was no new picture to display. I would eventually get a practical demonstration of that distinction with my fist still on screen.

## A picture first

The first pixels were deliberately uninteresting. An EVM contract generated a synthetic pattern and sent it through an event to the browser. At 320 by 200 pixels, with one palette index per pixel, a frame contained 64,000 bytes. Getting those bytes through a transaction receipt and onto Canvas proved that the route worked. It did not yet mean the EVM could draw DOOM.

The real renderer had to decide what the player could see. DOOM's map data includes a binary space partition, or BSP: a way of dividing the level so the renderer can visit nearby geometry and work out what it hides. The original drawing passes then turn walls, floors, ceilings and sprites into an indexed picture. Those passes, including texture sampling and lighting, had to execute in Solidity. The browser's remaining job was to turn each already chosen palette index into a display color.

We built a native reference from the pinned C source so that we could compare more than appearances. It was an adapted modern build, with its compiler, machine layout and host interfaces declared. It ran separately from the EVM. Its output served as evidence, never as a supply of game state or ready-made pictures for the port.

Eventually the synthetic image gave way to a complete world view. [Eight static views of Freedoom E1M1][first-frame] matched their native reference byte for byte. The measured production transaction for the first static frame consumed about 591 million gas, before we added moving gameplay.

<figure class="essay-visual media" id="SYNTHETIC_TRANSPORT">

<div class="media-pair">
  <img src="/media/posts/doom-on-evm/SYNTHETIC_TRANSPORT.png" alt="The Phase 0 browser displays a striped synthetic framebuffer labeled Not DOOM rendering.">
  <img src="/media/posts/doom-on-evm/FIRST_FRAME.png" alt="The verified Phase 2 EVM frame shows a textured Freedoom room and an open doorway.">
</div>

<figcaption>

*Left: a synthetic pattern proves that an EVM Frame event can reach Canvas. Right: the first retained, fully verified DOOM scene from the EVM renderer, one of eight native-matching Freedoom E1M1 views. The browser screenshot and isolated scene are shown as delivered.*

</figcaption>
</figure>

A room was a much more interesting result than a test pattern. It also offered an obvious next experiment: move through it. That meant carrying a living game from one transaction to the next.

A C program can leave a global variable where it is and read it on the next iteration of its loop. EVM working memory disappears when a call ends. Persistent contract storage survives, so the port had to load the relevant state, execute the original operations, then save what future calls would need. Player position and health were obvious. Less obvious were values that looked like temporary renderer scratch space but survived between frames in the C process.

Even drawing the scene could change the world we were comparing. One movement test agreed for 275 tics, then failed its final-state comparison. The discrepancy was a map-line flag: DOOM's wall renderer marks a line as seen for the automap. The native harness had observed the world before drawing; the EVM snapshot came afterward. Both engines could be behaving correctly while the comparison reported a disagreement.

We [moved the native observation to the matching boundary][observer]. No game rule needed changing, and there was no reason to erase the differing flag. The reference was software too. Its placement around the original engine could become part of the bug.

There were more ordinary obstacles. I had initially allowed a billion gas per transaction, and startup work was being split to fit. That cap was beginning to dictate the structure of the port. I raised the configurable budget to ten billion; the first measured atomic initialization used about [1.62 billion][startup]. The game could initialize in the original sequence once I stopped requiring it to fit inside a limit I had chosen myself.

With gameplay and rendering connected, the browser could respond to movement, doors, weapons and monsters. DOOM's simulation still advanced in logical tics, originally designed for 35 tics per second. A later [benchmark of DOOM II 1.9 MAP01][performance], using local Anvil 1.8.5 on an M3 Pro MacBook Pro, measured about 0.55 frames per second. Moving, turning and firing near the start of that map meant a median wait of about 1.8 seconds from input to Canvas. Each transaction advanced one tic and produced one frame. Direct RPC was essentially as slow, with Anvil occupying about one CPU core.

<figure class="essay-visual media" id="FIRST_MOVEMENT">

![A six-frame Freedoom sequence shows the viewpoint moving and the weapon appearing at the bottom of the screen.](/media/posts/doom-on-evm/FIRST_MOVEMENT.gif)

<figcaption>

*Six early gameplay tics, slowed for viewing. This animation uses retained native reference buffers whose hashes match the EVM Frame receipts. It shows the verified movement; its playback speed is not EVM execution speed.*

</figcaption>
</figure>

## The ghosts in memory

Before the punch incident, one of the early browser tests had already exposed a stranger problem. Four frames matched the native C reference. The fifth reverted with `DrawBounds()`. A working renderer had reached a source read that its own guard refused to permit.

There were plenty of ways for a Solidity port to get this wrong. The investigation ruled out gas exhaustion and checked the framebuffer and lighting-table dimensions. A reciprocal or fixed-point arithmetic difference could have sent the draw to the wrong source byte, so we traced the original C calculation. It arrived at exactly the same place. The [diagnostic][playw0] identified a world sprite called `PLAYW0`: 1,128 bytes of artwork, with both versions of the drawing code selecting offset 1,148.

The arithmetic was correct; the selected byte was outside the sprite. DOOM calls the named resource chunks in a WAD “lumps.” When the renderer draws a vertical column, it has a pointer into a lump and a texture coordinate that advances down the screen. That coordinate uses fixed-point arithmetic: an integer carries both the whole and fractional parts. The drawing loop shifts off the fractional bits and masks the result to the range 0–127.

Here, a coordinate just below zero became 127 under that calculation. The mask bounded the index relative to the pointer. It knew nothing about the lump's total length. Our Solidity guard did know, and rejected the read. The C pointer continued into whatever followed the artwork.

Following it meant looking outside the resource file. DOOM's `z_zone` allocator takes a large memory arena and divides it into blocks. Each block has a header containing bookkeeping: its size, ownership and links to neighboring blocks. In our adapted 64-bit ARM reference, the sprite read reached the next block's header, at a byte of the allocator's identifier.

The original allocation code had written the identifier. Its low byte, 17, passed through the renderer's lighting table and became a pixel. The memory allocator was contributing to the artwork.

That made allocation history relevant to a problem I had encountered as a missing picture. Copying the sprite bytes couldn't reproduce its neighbor. Which block followed it depended on earlier loads, frees, reuse and cache activity. The same drawing expression could encounter different physical neighbors as the game progressed.

We ported the original allocator's order and bookkeeping into Solidity, keeping a ledger of block positions, owners and lifetimes. Gameplay could still use typed objects, and artwork could remain in immutable resources. At a drawing boundary, a byte provider reconstructed a short extension beyond the lump, marking each byte as known or unknown. Separate native experiments varied resource sizes and neighbors to test the explanation beyond this one sprite. The renderer's guard stayed in place; it now had evidence for reads it had previously refused.

Later, my exploratory game stopped after the punch. We kept the live game intact and recovered its inputs, receipts and state, then investigated a separate copy. The port could already account for neighboring allocator fields. Yet the blood sprite, `BLUDA0`, still hit the guard.

We followed that address too. The draw passed the blood sprite's logical end, crossed its alignment slack and reached the next header. This time it landed between the size field and the pointer. There was no field to reconstruct. It was padding.

<figure class="essay-visual diagram" id="MEMORY_NEIGHBORHOODS">

<div class="diagram-scroll" tabindex="0" role="region" aria-label="Memory Neighborhoods diagram">
  <a href="/images/posts/doom-on-evm/MEMORY-NEIGHBORHOODS.svg" aria-label="Open full-size diagram"><img src="/images/posts/doom-on-evm/MEMORY-NEIGHBORHOODS.svg" alt="Two measured ARM64/LP64 memory neighborhoods: PLAYW0 samples offset 1148, a source-written identifier byte in the next header; BLUDA0 samples offset 332, uninitialized header padding beyond its separate alignment slack." loading="lazy"></a>
</div>

<figcaption>

*Two measured neighborhoods in the adapted ARM64/LP64 reference. [PLAYW0][playw0] reaches a source-written field; [BLUDA0][blood] reaches header padding. The offsets belong to these observations, not a universal C layout.*

</figcaption>
</figure>

The original program obtained its arena with `malloc`, then wrote header members individually. It had not established an initial value for this padding. To test whether the pixel really depended on that omission, we filled native test arenas with different byte patterns and ran the original allocator and drawing code. In those experiments, the sampled padding retained the initial pattern, and the pixel changed with it.

We could produce several answers without changing the drawing algorithm. More faithful arithmetic wasn't going to choose between them. Nor had these tests recovered the arbitrary contents of the original crashed process; they demonstrated why its source code could not supply one universal answer.

Both investigations concerned reads outside logical resources but still inside the larger host allocation. A tool such as AddressSanitizer could miss those internal boundaries. A clean run also said nothing about whether padding had been initialized. PLAYW0 had led us to a source write. BLUDA0 had led us to a byte whose value depended on the execution environment.

For ordinary gameplay we selected an explicitly zeroed initial arena, matching the native gameplay harness. The Solidity model could supply zero for untouched bytes eligible under that policy, while keeping their provenance distinct from source-written data. It also remembered where allocations might have overwritten them. Freeing a block or clearing the arena did not make those bytes new again. Unsupported contents remained unknown and still caused rejection.

Replaying my captured inputs under that policy produced 445 frames matching the initialized reference. Strict mode matched the preceding 444 and rejected the blood-sprite read again. These were useful, different results: one showed that the selected compatibility policy let the sequence continue; the other showed that the guard still recognized what the original source had not specified.

The later [native-memory audit][restrict] called the boundary **RESTRICT**. Exactness belonged to named compiler, layout and memory profiles, with explicit exclusions. We had a way to get past this blood sprite and an account of the bytes we supplied. We had not acquired a universal value for uninitialized C padding.

## Borrowing somebody else's playing

One proposed next test was to have an AI agent complete every level. I tried to imagine it at a boss fight: inspect a frame, choose buttons, submit an EVM transaction, wait, inspect the next frame. Repeat until the level was finished, then do the next one.

I generally prefer delegating work whose execution I can at least roughly understand. This seemed an impractical amount of game-playing machinery to build just to find out whether the game worked. Speedrunners had already done the playing. Their recordings offered a much more direct way through a level.

A DOOM demo records movement, turning and button commands rather than a video of the result. Feed those commands into a compatible engine and it has to reconstruct what happened. The player supplies no monster positions or collision answers. Every pickup, shot, random-number call and exit trigger has to follow from the inputs and the engine's state.

I thought this would be the quickest practical way to verify a complete level. I wasn't sure the Solidity port would actually reproduce the whole sequence. Up to that point, individual comparisons had given us good reasons to trust particular behavior. An authentic run would ask many of those behaviors to work together, in an order chosen by somebody trying to finish quickly.

The first experiment used a real Freedoom E1M1 demo. We extracted its original commands and replayed them through the adapted C reference and the EVM. Both reached the genuine exit, with their declared gameplay snapshots in agreement. The executed part of the run lasted about eight seconds in game time.

Its [first MP4][first-video] contained 279 encoded frames, but only 56 distinct EVM renders. Sampled pictures were held across the intervening video frames. That was an honest record of the captures we had, and a reason to ask for the rest.

<figure class="essay-visual media" id="FIRST_SAMPLED_SPEEDRUN">

<video controls playsinline preload="metadata" width="800" height="600" aria-label="First sampled Freedoom E1M1 speedrun: 56 EVM captures held across 279 encoded frames.">
  <source src="/media/posts/doom-on-evm/FIRST_SAMPLED_SPEEDRUN.mp4" type="video/mp4">
  <a href="/media/posts/doom-on-evm/FIRST_SAMPLED_SPEEDRUN.mp4">Watch the first sampled Freedoom recording.</a>
</video>

<figcaption>

*The first sampled recording: 56 EVM pictures held across 279 video frames. Original input recording by [asdf435][freedoom-run], replayed by this project with Freedoom resources.*

</figcaption>
</figure>

Every-tic rendering stopped at tic 52. Once again the drawing loop wanted a byte beyond a sprite. This time it reached part of a pointer in a neighboring allocator header. A pointer records an address, and the native process's memory placement could affect that address. Normal and sanitized C builds supplied different byte values and, through the lighting table, different pixels.

Zero-initializing the arena could not solve this. The allocator had written the pointer; what varied was where its target lived. We introduced an explicit virtual-address policy: valid objects in the modeled arena received deterministic address representations based on their identities and offsets. Those values were checked against the allocator's current relationships and lifetimes. They were not a promise to reproduce every possible native process address.

The [later experiment][virtual] produced 279 genuine EVM-rendered frames. They matched the normal native builds; the sanitized reference retained its one-pixel difference. An eight-second run had taken us into the representation of C pointers.

<figure class="essay-visual media" id="FULL_RATE_SPEEDRUN">

<video controls playsinline preload="metadata" width="800" height="600" aria-label="Later Freedoom E1M1 experiment with 279 distinct EVM-rendered frames, one for every executed gameplay tic.">
  <source src="/media/posts/doom-on-evm/FULL_RATE_SPEEDRUN.mp4" type="video/mp4">
  <a href="/media/posts/doom-on-evm/FULL_RATE_SPEEDRUN.mp4">Watch the later full-rate Freedoom recording.</a>
</video>

<figcaption>

*The later experiment renders all 279 gameplay tics, using the declared virtual-pointer policy. Same input recording by [asdf435][freedoom-run]. “Full-rate” describes the captured game tics; 35 FPS is the video's playback cadence.*

</figcaption>
</figure>

What had begun as a way to avoid teaching an agent to play was becoming a demanding integration test. The input sequence stayed fixed while the engine had to account for more of its consequences. Getting to the exit and producing every picture of the journey were separate achievements.

<figure class="essay-visual diagram" id="SPEEDRUN_PIPELINE">

<div class="diagram-scroll" tabindex="0" role="region" aria-label="Speedrun Pipeline diagram">
  <a href="/images/posts/doom-on-evm/SPEEDRUN_PIPELINE.svg" aria-label="Open full-size diagram"><img src="/images/posts/doom-on-evm/SPEEDRUN_PIPELINE.svg" alt="Human demo inputs feed EVM replay and a separate native reference. EVM frames go directly to host video encoding and separately to native verification." loading="lazy"></a>
</div>

<figcaption>

*The eventual [recording and comparison pipeline][video-tools]. EVM frames feed the encoder directly; the dotted branches perform separate verification against native output. Full presentations also use declared post-exit UI inputs and matching display histories. The host expands palettes and encodes already rendered images.*

</figcaption>
</figure>

## Nine maps and a minus sign

The next suite used Ultimate DOOM and recordings by experienced human players. These were nine standalone map completions, one for each Episode One map, including the secret map. They did not form one uninterrupted episode playthrough. The commercial IWAD was supplied separately and authenticated; this was a different resource profile from the earlier Freedoom experiment.

Authenticity did not guarantee compatibility. A fast E1M8 recording crashed the native reference. Investigation reached an original fixed-size array whose writes could run past its end during the recorded route. Supporting that tape would have meant accounting for behavior beyond the accepted native domain. We preserved the failure and selected a [different authentic recording by Sedlo][e1m8]. It reached the exit under the supported gameplay profile.

All nine selected gameplay replays eventually completed, exceeding my expectations. Four recordings were still blocked on pictures. Their failing reads reached addresses of resource-cache owner slots, stored outside the allocator's own arena. Knowing which sprite occupied a block did not tell us where the native process had put the slot that owned it. A separate virtual address domain for authenticated, live owner slots let those recordings continue. The same rule about scope remained: modeled identities were stable; native addresses were not universal constants.

Making the recordings into complete presentations also brought earlier UI work back into focus. I had a straightforward reason to want the original Status Bar: without it, I couldn't see my health or ammunition. That information was useful even at the pace I was playing. Beyond practical omissions like this, there was no single reason or master plan for everything that followed. I wanted to keep going and see how far the experiment could go.

<figure class="essay-visual media" id="STATUS_BAR">

![Earlier Freedoom world-only output beside a later EVM frame with ammunition, health, armor and the face in the Status Bar.](/media/posts/doom-on-evm/STATUS_BAR.png)

<figcaption>

*The Status Bar arrives. These are different game states from successive development stages, rather than a same-state comparison. Both the later world view and the original-derived Status Bar are drawn inside the EVM, using Freedoom artwork.*

</figcaption>
</figure>

The intermission statistics, melting transitions and finale gave us more to reproduce. A level exit could be correct while the presentation after it was incomplete. The recorder eventually executed the original-derived Status Bar, Intermission, finale and Melt Wipe code inside the EVM. Post-exit button inputs were explicitly added for presentation; we didn't pretend they belonged to the human's original gameplay recording. Even shortening an intermission used the original game's button handling.

<figure class="essay-visual media" id="MELT_WIPE">

![The Ultimate DOOM title image melts downward in uneven columns to reveal E1M1 and its Status Bar.](/media/posts/doom-on-evm/MELT_WIPE.gif)

<figcaption>

*The original-derived screen melt, computed inside the EVM recording pipeline. This excerpt comes from the earlier long E1M1 pilot, replaying aconfusedhuman's inputs. This recording predates the browser integration.*

</figcaption>
</figure>

Then the complete E1M2 recording disagreed with the native reference at a wall pixel. The texture bytes agreed. So did the lighting table, the drawing calculation and the order of the relevant draw. Following the sampled address took us back to allocation history. Native and EVM journals matched for a long prefix, then the native run made one extra allocation. It was loading `STTMINUS`, the Status Bar's minus sign.

Our native adapter borrowed UI artwork from immutable buffers outside the zone allocator, matching the EVM's resource arrangement. It had redirected the other relevant UI loads but missed this one. The minus-sign graphic occupied 128 bytes; with its allocator header, the extra native allocation took 168.

That small allocation moved later blocks. Eventually it changed the size of a free block next to a wall texture. The renderer read a byte of that size, just beyond the texture data, and used it as a color. Loading a minus sign at startup had changed the appearance of a wall much later in the run. The glyph did not need to be on screen.

This was an inconsistency in the adapted reference. Original DOOM was entitled to allocate its minus sign; our comparison required both sides to apply the same declared UI borrowing rule. We [corrected the native adapter][minus]. The EVM pictures already on disk then matched, including their palettes. They needed no repair, and the original C engine code remained unchanged.

The earlier map-flag discrepancy had been a disagreement about when to observe the game. This one was a disagreement about the memory environment in which to observe it. In both cases, changing the EVM to satisfy the first comparison would have hidden the actual cause.

## Watching it run

By the end, there were nine complete video presentations. Together they contained 18,175 EVM-rendered frames, including title, gameplay, transitions, intermissions and finale. Of those, 18,173 matched the declared native reference exactly as indexed pictures, before video encoding. Two frames retained three differing pixels at documented virtual-pointer samples. The [recording evidence][videos] keeps those exceptions alongside the successful comparisons.

The comparison used our adapted native builds, with initialized memory, consistent UI borrowing and matched drawing histories. Its [declared recording profile][video-tools] also specifies when to observe gameplay and how to compare each kind of picture. Completing the videos didn't remove those boundaries, or turn a virtual pointer into a universal native address.

<figure class="essay-visual media" id="ACCEPTED_E1M1_VIDEO">

<video controls playsinline preload="metadata" width="800" height="600" aria-label="Accepted Ultimate DOOM E1M1 presentation with title, melt, gameplay, original Status Bar and intermission; 547 EVM-rendered frames.">
  <source src="/media/posts/doom-on-evm/ACCEPTED_E1M1_VIDEO.mp4" type="video/mp4">
  <a href="/media/posts/doom-on-evm/ACCEPTED_E1M1_VIDEO.mp4">Watch the accepted Ultimate DOOM E1M1 recording.</a>
</video>

<figcaption>

*The accepted E1M1 presentation: 547 frames, one of the nine standalone map recordings. Input recording: aconfusedhuman's `e1m1-903`, via [DSDA][ultimate-run]. The EVM generated these pictures; the video plays them at 35 FPS. This is the abbreviated corpus entry, separate from the longer pilot.*

</figcaption>
</figure>

The successful transactions for the final nine recordings consumed almost nineteen trillion gas: resource and engine deployment, startup, gameplay, capture and presentation. Failed attempts and separate diagnostics are outside that [measured total][gas]. It is a local execution measurement, not a Mainnet invoice.

The finished videos play at 35 frames per second, totaling about 8 minutes 39 seconds across the nine recordings. Their [telemetry][gas] records more than five hours of cumulative transaction RPC processing, including deployment, startup, gameplay, rendering, capture and presentation.

The [repository][repo] contains the port, evidence and local browser setup. Its limits remain specific: commercial resources are user-supplied; sound, music and multiplayer are unsupported. DOOM II has all-map startup checks and selected completed runs, rather than complete gameplay verification of all 32 maps. Save and Load use an [Exact EVM Snapshot][save] of the port's state, deliberately differing from original DOOM's reconstruction on load.

When I tried to play it myself, I used `IDDQD` and `IDFA` — god mode and a full arsenal.

<figure class="essay-visual media" id="CHEAT_CODE_PLAY">

![DOOM gameplay with AMMO (NO KEYS) ADDED at the top and Doomguy's glowing golden eyes in the original Status Bar.](/media/posts/doom-on-evm/CHEAT_CODE_PLAY.png)

<figcaption>

*DOOM on EVM, with both cheats enabled.*

</figcaption>
</figure>

At the keyboard, I still wait for the next transaction.

---

<!-- NEXT_ARTICLE_URL: TODO -->
<aside class="next-article" aria-label="Next article">
  <p><strong>Next article — Coming soon</strong><br>
  <em>Building DOOM on EVM with AI Coding Agents</em> (working title)</p>
</aside>

[blood]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/DRAWBOUNDS-BLOOD-CRASH.md
[decisions]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/01-IDEA-AND-DECISIONS.md
[architecture]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/ARCHITECTURE.md
[first-frame]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/PHASE2-REPORT.md
[observer]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/artifacts/phase3/post-render-reference-checkpoint.json
[startup]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/tools/reference/gameplay/production-atomic-evidence.json
[performance]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/benchmarks/DOOM2-MAP01-PERFORMANCE.md
[melt-browser]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/INTEGRATION-BENCHMARK-MELT-WIPE.md
[playw0]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/artifacts/phase3/historical-draw-diagnosis.json
[restrict]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/PHASE4-NATIVE-MEMORY-AUDIT.md
[first-video]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/SPEEDRUN-E1M1-VIDEO.md
[virtual]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/EXPERIMENTAL-VIRTUAL-POINTERS.md
[video-tools]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/tools/reference/full_videos/README.md
[e1m8]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/artifacts/ultimate-speedruns/E1M8/alternatives/sedlo-046/source.json
[minus]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/artifacts/full-videos/diagnostics/E1M2-allocation-divergence.json
[videos]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/artifacts/full-videos/EPISODE-SUMMARY.md
[gas]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/artifacts/full-videos/episode-telemetry.json
[repo]: https://github.com/ediskandarov/doom-evm
[save]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/docs/DEATH-SAVE-LOAD-INTEGRATION.md
[freedoom-notice]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/test/fixtures/wad/COPYING.txt
[freedoom-credits]: https://github.com/ediskandarov/doom-evm/blob/b377d2cf09c7be9d1a2056eb0a9c5c4818f5a3e8/test/fixtures/wad/CREDITS.txt
[freedoom-run]: https://www.speedrun.com/freedoom_phase_1/runs/zg677ovm
[ultimate-run]: https://dsdarchive.com/wads/doom?category=UV+Speed&level=E1M1
