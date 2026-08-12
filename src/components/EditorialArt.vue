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
        d="M52 26C46 27 42 32 43 38C46 76 47 116 46 160C46 167 50 171 57 171C91 173 127 172 149 169C156 168 160 163 159 156C156 117 155 75 157 37C157 30 153 26 146 26C117 23 81 23 52 26Z"
      />
      <g class="art-ink">
        <path d="M62 68C82 63 102 71 122 66C138 62 152 70 170 63" stroke-width="7" />
        <path d="M62 96C74 93 84 97 94 94" stroke-width="6" />
      </g>
      <path
        class="art-solid"
        d="M104 87C111 85 117 90 116 97C115 104 108 106 103 102C98 97 99 89 104 87Z"
      />
    </template>

    <!-- A torn-off scrap, corner folded, three shortening lines. -->
    <template v-else-if="name === 'scrap'">
      <path
        class="art-carrier"
        d="M44 44C38 45 35 50 36 56C40 88 41 120 39 150C39 157 43 161 50 161C74 162 98 162 118 160L161 118C164 115 165 111 164 107C162 87 161 66 162 50C162 44 158 40 152 41C116 44 78 41 44 44Z"
      />
      <g class="art-ink">
        <path d="M118 160C121 146 126 130 131 125C137 121 148 120 161 118" stroke-width="5" />
        <path d="M58 74C74 70 90 76 110 72" stroke-width="7" />
        <path d="M58 96C70 93 82 97 94 94" stroke-width="6" />
        <path d="M58 118C66 116 72 118 79 117" stroke-width="5.5" />
      </g>
    </template>

    <!-- An empty cup on its saucer. -->
    <template v-else-if="name === 'empty-cup'">
      <path
        class="art-carrier"
        d="M100 30C128 28 154 44 164 70C174 96 168 126 148 145C128 164 98 170 74 160C50 150 34 126 34 100C34 72 54 46 82 34C88 31 94 30 100 30Z"
      />
      <g class="art-ink">
        <path d="M58 76C84 69 118 69 145 77" stroke-width="7" />
        <path
          d="M64 80C66 112 73 138 87 148C98 156 114 155 124 146C136 136 140 110 140 80"
          stroke-width="7.5"
        />
        <path d="M141 92C156 87 167 96 165 108C163 121 152 127 140 125" stroke-width="6.5" />
        <path d="M48 166C78 173 126 173 156 165" stroke-width="6" />
      </g>
    </template>

    <!-- A page torn in two, the halves drifted apart. -->
    <template v-else-if="name === 'torn-page'">
      <path
        class="art-carrier"
        d="M46 30C40 31 36 36 37 42C40 82 41 122 39 160C39 167 43 171 50 171L92 169L84 148L96 128L82 108L94 88L82 66L92 46L88 30Z"
      />
      <path
        class="art-carrier"
        d="M106 40L100 54L112 74L98 94L110 114L96 134L106 154L102 178L152 176C158 176 162 171 161 165C158 126 157 84 160 48C160 42 156 38 150 38Z"
      />
      <g class="art-ink">
        <path d="M56 68C65 65 73 69 80 66" stroke-width="6.5" />
        <path d="M56 94C63 92 69 95 76 93" stroke-width="5.5" />
        <path d="M120 84C130 81 140 85 150 82" stroke-width="6.5" />
        <path d="M118 114C126 112 134 115 144 113" stroke-width="5.5" />
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
  width: 7.5rem;
  height: 7.5rem;
}

/* Three layers, after Anthropic's editorial illustrations: an irregular
   carrier shape separating the subject from the page, then near-black
   gestural ink on top. The reference palette (#FAF9F5 carrier, #141413 ink)
   is expressed through tokens rather than hardcoded, so the drawings invert
   correctly in dark mode and gain contrast in the high-contrast themes. */
.art-carrier {
  fill: color-mix(in srgb, var(--accent) 12%, var(--bg-subtle));
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
