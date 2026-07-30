# Page transitions — design

Smooth yet restrained non-linear animations for transitions between pages.
Decisions below were settled in a grilling session on 2026-07-30; implementation
follows this doc after review.

## Decisions (settled)

| Question | Decision |
| --- | --- |
| What "non-linear" means | Expressive **easing curves** (decelerating cubic-bezier), not asymmetric choreography or direction-aware slides |
| Scope | **All routes**, including nested admin children (posts list ↔ editor) |
| Visual form | **Fade + subtle rise**: new page fades in while drifting up a few px |
| Sequencing | **`out-in`** — old page leaves fast, then new page enters; no layout overlap |
| First load | **Animates too, but shorter** than a navigation enter |
| Process | Design doc first (this file), implementation after review |

## Motion spec

All values become design tokens in `src/style.css` `:root`, next to the
existing type/layout tokens.

```css
/* Motion — non-linear curves for route transitions */
--ease-out:   cubic-bezier(0.16, 1, 0.3, 1);   /* decelerate into rest — enter */
--ease-in:    cubic-bezier(0.4, 0, 1, 1);       /* accelerate away — leave */
--page-enter: 250ms;
--page-leave: 120ms;
--page-appear: 160ms;
```

- **Leave** (120ms, `--ease-in`): opacity → 0, `translateY(-4px)`. Fast and
  quiet — navigation must still feel immediate.
- **Enter** (250ms, `--ease-out`): opacity 0 → 1 from `translateY(8px)`.
  Content "settles onto the page." Total perceived beat ≈ 370ms.
- **Appear** (first load, 160ms, `--ease-out`): same shape as enter but
  shorter, so cold visits and shared-link opens pay a minimal perceived-LCP
  cost while the site still feels cohesive from the first frame.
- One direction of travel (upward settle); never a horizontal slide, never a
  fade through a solid color.

## Architecture

### Transition wrappers (two)

1. **`src/App.vue`** — wrap the public `<RouterView />` using the slot API:

   ```vue
   <RouterView v-slot="{ Component }">
     <Transition name="page" mode="out-in" appear>
       <component :is="Component" />
     </Transition>
   </RouterView>
   ```

2. **`src/admin/AdminLayout.vue`** — same pattern (without `appear`; the
   outer wrapper already animates the layout in) around its nested
   `<RouterView />` so posts-list ↔ editor swaps animate too.

The `appear` custom classes (`page-appear-active` / `page-appear-from`) get
the shorter `--page-appear` duration; navigation enter/leave use the standard
`page-*` classes. Transition CSS lives in `src/style.css` (cross-component,
so not in a scoped block).

### Route reuse caveat

Vue only runs the transition when the rendered **component** changes.
`/writing/a → /writing/b` reuses `PostView` (it refetches in place), and
hash-only navigations (`/#writing → /#notes`) reuse `HomeView` — neither
animates, and that is the desired behavior. Do **not** key the view by
`fullPath`; that would remount on hash changes and destroy in-page state.

### Scroll coordination

The router's `scrollBehavior` currently fires immediately, which under
`out-in` would yank the scroll position while the outgoing view is still
visible. Fix: when the navigation will actually swap components, return a
Promise that resolves the scroll target after `--page-leave` has elapsed, so
the jump lands in the gap between leave and enter.

- Mirror the leave duration as `PAGE_LEAVE_MS` in a new `src/shared/motion.ts`
  (single source of truth note pointing at `--page-leave`).
- Detect "will swap" by comparing `to.matched[i].components.default` against
  `from.matched[i]` at every level; if nothing swaps (param-only or hash-only
  navigation), scroll immediately as today.
- Under `prefers-reduced-motion`, scroll immediately (no artificial delay).

### Layout hazards (known from a prior spike)

- **Footer jump**: `out-in` empties the flow between views, so the footer in
  `.page-wrap` would leap up into the viewport mid-swap. Reserve height on a
  wrapper (`min-height: 100vh` while swapping, toggled via the transition's
  `before-leave` / `after-enter` / `*-cancelled` hooks).
- **`position: fixed` inside the transform**: a transformed ancestor becomes
  the containing block for fixed descendants. `PostView`'s reading-progress
  bar must be `<Teleport to="body">`-ed (or equivalent) so the enter/leave
  transform can't re-anchor it. Audit other fixed elements inside views.

## Accessibility

- The sitewide `prefers-reduced-motion` block in `src/style.css` already
  clamps all transition durations to 0.01ms, which covers these classes
  automatically — no extra CSS needed. Keep durations near-zero rather than
  `none` so Vue's `transitionend` still fires.
- Also skip the scroll-delay under reduced motion (see above) via a
  `prefersReducedMotion()` helper in `src/shared/motion.ts`.
- Focus: the skip-link's imperative `#main` focus is unaffected by `out-in`
  since the new view exists when the user can interact again.

## Out of scope

- Direction-aware transitions (back vs. forward).
- Shared-element / view-transition API morphs.
- Animating in-page hash scrolls (already smooth-scrolled).

## Implementation checklist

1. Motion tokens in `src/style.css` `:root`; `page-*` and `page-appear-*`
   transition classes in the global stylesheet.
2. `src/shared/motion.ts` — `PAGE_LEAVE_MS`, `prefersReducedMotion()`.
3. `src/App.vue` — transition wrapper with `appear` + swap-height guard.
4. `src/admin/AdminLayout.vue` — nested transition wrapper.
5. `src/router/index.ts` — delayed `scrollBehavior` with component-swap
   detection.
6. `src/views/PostView.vue` — teleport the reading-progress bar to `body`.
7. Validate: `npm run typecheck && npm run lint && npm test`, then exercise
   in the browser — home ↔ post, admin list ↔ editor, back/forward with
   saved scroll positions, hash nav, reduced-motion emulation, first load.
