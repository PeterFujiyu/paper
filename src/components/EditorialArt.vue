<template>
  <svg
    class="editorial-art"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    aria-hidden="true"
    focusable="false"
  >
    <!-- A page with one line written on it and a cursor still waiting. -->
    <template v-if="name === 'blank-page'">
      <path
        class="art-carrier"
        d="M53 29C48 29 45 33 45 38L47 159C47 165 51 169 57 169L147 167C153 167 157 163 157 157L155 39C155 33 151 29 145 29Z"
      />
      <g class="art-ink">
        <path d="M65 70C82 67 101 71 118 68C132 65 146 70 161 66" stroke-width="4.5" />
        <path d="M65 95C77 93 87 96 97 94" stroke-width="3.6" />
      </g>
      <path
        class="art-solid"
        d="M107 89C112 88 116 92 115 97C114 102 109 104 105 101C102 98 103 90 107 89Z"
      />
    </template>

    <!-- A torn-off scrap, corner folded, the note still short. -->
    <template v-else-if="name === 'scrap'">
      <path
        class="art-carrier"
        d="M46 47C41 47 38 51 38 56L40 149C40 155 44 159 50 159L117 157L159 117C162 114 163 111 163 107L161 52C161 46 157 42 151 43Z"
      />
      <g class="art-ink">
        <path d="M117 157C119 145 123 131 128 126C133 122 145 121 159 117" stroke-width="3" />
        <path d="M61 79C75 76 90 80 105 77" stroke-width="4.5" />
        <path d="M61 100C72 98 82 101 92 99" stroke-width="3.6" />
      </g>
    </template>

    <!-- An empty cup on its saucer. -->
    <template v-else-if="name === 'empty-cup'">
      <path
        class="art-carrier"
        d="M100 34C126 34 149 49 158 72C167 94 162 120 145 138C127 155 100 161 78 152C56 143 41 120 41 97C41 63 68 34 100 34Z"
      />
      <g class="art-ink">
        <path d="M69 82C88 78 113 78 132 83" stroke-width="4.5" />
        <path
          d="M74 86C76 110 81 129 91 137C99 143 110 142 118 136C126 128 129 109 129 86"
          stroke-width="4.5"
        />
        <path d="M130 95C141 92 148 98 147 106C146 115 138 119 129 118" stroke-width="3.4" />
        <path d="M62 150C83 155 117 155 138 149" stroke-width="3.4" />
      </g>
    </template>

    <!-- A page torn in two, the halves drifted apart. -->
    <template v-else-if="name === 'torn-page'">
      <path
        class="art-carrier"
        d="M48 32C43 32 40 36 40 41L42 158C42 164 46 168 52 168L91 166L86 148L95 130L86 111L95 91L86 70L93 49L90 32Z"
      />
      <path
        class="art-carrier"
        d="M107 43L102 57L111 75L101 94L110 113L100 132L106 152L103 175L149 173C155 173 159 169 159 163L157 50C157 44 153 40 147 40Z"
      />
      <g class="art-ink">
        <!-- Thinner than the other three because this one is displayed at 7rem,
             not 5rem: 3.2 here and 4.5 there both land near 1.8px on screen. -->
        <path d="M58 70C66 68 73 71 80 68" stroke-width="3.2" />
        <path d="M58 94C64 92 70 95 76 93" stroke-width="2.6" />
        <path d="M120 85C129 82 138 86 147 83" stroke-width="3.2" />
        <path d="M119 113C126 111 133 114 141 112" stroke-width="2.6" />
      </g>
    </template>
  </svg>
</template>

<script setup lang="ts">
export type ArtName = 'blank-page' | 'scrap' | 'empty-cup' | 'torn-page'

defineProps<{ name: ArtName }>()
</script>

<style scoped>
/* Sized by the parent — Vue puts the parent's scope id on a child root, so
   `.some-class { width: … }` in the consumer reaches this element. */
.editorial-art {
  flex: none;
  width: 5rem;
  height: 5rem;
}

/* Three layers, after Anthropic's editorial illustrations: an irregular
   carrier shape separating the subject from the page, then near-black
   gestural ink on top. The reference palette (#FAF9F5 carrier, #141413 ink)
   is expressed through tokens rather than hardcoded, so the drawings invert
   correctly in dark mode and gain contrast in the high-contrast themes.

   Weights are set against this page, not against the reference. Those drawings
   are newsroom heroes rendered near 1000px, where a stroke of 7 on a 200 unit
   box is right; here they are 80px spots beside 0.9rem italic text, on a page
   whose whole grammar is 1px hairlines. At 80px these strokes land near 1.4-1.8px
   — still visibly drawn by hand, no longer three times heavier than every rule
   around them. The carriers are held to near-true rectangles and circles for the
   same reason: enough wobble to read as hand-made, not enough to go folksy. */
.art-carrier {
  fill: color-mix(in srgb, var(--accent) 9%, var(--bg-subtle));
}

.art-ink path {
  fill: none;
  stroke: var(--text-main);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.art-solid {
  fill: var(--text-main);
}
</style>
