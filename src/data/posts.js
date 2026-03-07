/**
 * posts.js — 文章数据集中管理
 *
 * 新增一篇文章：在数组头部插入一个对象，字段说明：
 *   slug    URL 路径，唯一标识，使用小写英文 + 连字符
 *   date    显示用日期，如 "March 2026"
 *   title   文章标题
 *   excerpt 列表页摘要（1–2 句）
 *   content 正文，支持换行（\n\n 为段落分隔）
 */
export const posts = [
  {
    slug: 'on-whitespace',
    date: 'March 2026',
    title: 'On Whitespace: Why Emptiness Is a Design Decision',
    excerpt:
      'The urge to fill every corner of a screen mirrors a deeper anxiety—that silence might be mistaken for absence. But restraint, practiced well, is its own kind of presence.',
    content: `The urge to fill every corner of a screen mirrors a deeper anxiety—that silence might be mistaken for absence. We cram sidebars, stack notifications, and layer modals because empty space feels like wasted potential. But restraint, practiced well, is its own kind of presence.

Traditional print designers understood this instinctively. A magazine spread with a single photograph and three lines of type commands more attention than a page dense with copy. The emptiness is not passive; it is load-bearing. It holds the weight of what surrounds it.

On the web, whitespace has an additional function: it slows the reader down. In an environment engineered for maximum throughput—infinite scroll, autoplay, push notifications—a generous margin is a small act of resistance. It says: this is worth pausing for.

There is a practical dimension too. Research on reading comprehension consistently shows that line length, line height, and surrounding space directly affect how much we retain. A column constrained to 60–70 characters per line, with a line-height of 1.6 or more, produces measurably better recall than the same text rendered edge to edge.

The challenge is that whitespace is invisible to stakeholders. You cannot point to it in a design review and say: here is the value. You can only demonstrate it by removing it, watching the design collapse, and hoping the room notices the difference.`,
  },
  {
    slug: 'serif-comeback',
    date: 'January 2026',
    title: 'The Quiet Return of the Serif',
    excerpt:
      'Sans-serifs dominated the 2010s, promising clarity and neutrality. Now the serif is back—not as nostalgia, but as an argument for depth in an age of infinite scroll.',
    content: `Sans-serifs dominated the 2010s. Helvetica Neue, then Inter, then the system-ui stack—all promising the same thing: clarity, neutrality, the absence of historical baggage. The logic was sound. Screens were low-resolution. Serifs rendered poorly at small sizes. Choose the tool that works.

But screens changed. Retina displays arrived, then OLED panels with sub-pixel precision. The technical argument against serifs dissolved. And yet we kept reaching for sans-serifs, not because they were better for screens anymore, but because they had become the default language of "digital."

Now something is shifting. Not a trend, exactly—more like a correction. Designers are rediscovering that the small horizontal strokes at the base of letterforms were never decorative. They guide the eye along the baseline, creating a rhythm that the reader follows unconsciously. At longer reading lengths, serifs reduce fatigue. They carry connotations of time and considered thought that sans-serifs, by design, cannot.

The return of the serif is not nostalgia. It is an argument. In an environment of frictionless surfaces and optimized feeds, a serif typeface slows the reader slightly—and that friction is the point. It signals: this was written to be read, not scanned.

Georgia, the typeface in use here, was designed in 1993 specifically for screen legibility. It predates the design monoculture that followed. That it still reads as fresh is either an indictment of how little progress we made, or evidence that some problems were solved correctly the first time.`,
  },
  {
    slug: 'reading-pace',
    date: 'November 2025',
    title: 'Designing for Reading Pace, Not Engagement',
    excerpt:
      'Most interfaces are optimized to capture attention. But what would it mean to design for the opposite—to create a surface that slows you down, lets you think?',
    content: `Most interfaces are optimized for engagement. That word—engagement—has become so embedded in product thinking that we rarely stop to ask what it means. Technically, it means time spent, clicks made, actions taken. In practice, it often means anxiety: the low-level compulsion to check, refresh, respond.

What would it mean to design for reading pace instead?

The question is not rhetorical. There are design decisions that actively slow the reader—that create what might be called productive friction. A constrained line length that prevents the eye from racing ahead. A typeface with enough detail to reward close attention. Generous leading that gives each line room to breathe. No pull-to-refresh. No notification badge. No suggested reading queue materializing at the bottom of the page before you have finished the one you are on.

These are not omissions. They are decisions. Designing for pace means accepting that some readers will leave. The ones who stay will read differently—more fully, with more of themselves present.

There is a commercial counterargument, and it is not wrong: slow reading does not scale. Advertisers pay for attention measured in seconds, not quality. A publication that optimizes for depth will, by most metrics, appear to perform worse than one that optimizes for volume.

But metrics are a choice too. You can measure what you decide matters. The question is whether anyone is willing to make that decision first.`,
  },
]

/**
 * 按 slug 查找文章
 */
export function getPostBySlug(slug) {
  return posts.find((p) => p.slug === slug) ?? null
}
