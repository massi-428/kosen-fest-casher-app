import localFont from 'next/font/local';

// 1. LINE Seed JP
export const lineSeedJP = localFont({
  src: [
    {
      path: './font/LINE_Seed_JP/LINESeedJP_OTF_Th.woff2',
      weight: '100', // Thin
      style: 'normal',
    },
    {
      path: './font/LINE_Seed_JP/LINESeedJP_OTF_Rg.woff2',
      weight: '400', // Regular
      style: 'normal',
    },
    {
      path: './font/LINE_Seed_JP/LINESeedJP_OTF_Bd.woff2',
      weight: '700', // Bold
      style: 'normal',
    },
    {
      path: './font/LINE_Seed_JP/LINESeedJP_OTF_Eb.woff2',
      weight: '900', // ExtraBold
      style: 'normal',
    },
  ],
  variable: '--font-line-seed',
  display: 'swap',
});

// 2. Makinas 4 (Flat)
export const makinasFlat = localFont({
  src: './font/makinas4/Makinas-4-Flat.otf',
  variable: '--font-makinas-flat',
  display: 'swap',
});

// 3. Makinas 4 (Square)
export const makinasSquare = localFont({
  src: './font/makinas4/Makinas-4-Square.otf',
  variable: '--font-makinas-square',
  display: 'swap',
});

// 4. Zen Kaku Gothic Antique (Zen角ゴシックAntique)
export const zenKakuAntique = localFont({
  src: [
    {
      path: './font/Zen_Kaku_Gothic_Antique/ZenKakuGothicAntique-Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: './font/Zen_Kaku_Gothic_Antique/ZenKakuGothicAntique-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './font/Zen_Kaku_Gothic_Antique/ZenKakuGothicAntique-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './font/Zen_Kaku_Gothic_Antique/ZenKakuGothicAntique-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './font/Zen_Kaku_Gothic_Antique/ZenKakuGothicAntique-Black.ttf',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-zen-kaku',
  display: 'swap',
});

// 5. Zen Maru Gothic (Zen丸ゴシック)
export const zenMaruGothic = localFont({
  src: [
    {
      path: './font/Zen_Maru_Gothic/ZenMaruGothic-Light.ttf',
      weight: '300',
      style: 'normal',
    },
    {
      path: './font/Zen_Maru_Gothic/ZenMaruGothic-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './font/Zen_Maru_Gothic/ZenMaruGothic-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './font/Zen_Maru_Gothic/ZenMaruGothic-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './font/Zen_Maru_Gothic/ZenMaruGothic-Black.ttf',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-zen-maru',
  display: 'swap',
});

// 6. Zen Old Mincho (Zenオールド明朝)
export const zenOldMincho = localFont({
  src: [
    {
      path: './font/Zen_Old_Mincho/ZenOldMincho-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './font/Zen_Old_Mincho/ZenOldMincho-Medium.ttf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './font/Zen_Old_Mincho/ZenOldMincho-SemiBold.ttf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './font/Zen_Old_Mincho/ZenOldMincho-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: './font/Zen_Old_Mincho/ZenOldMincho-Black.ttf',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-zen-mincho',
  display: 'swap',
});

// 7. F1.8 (デジタル数字風フォント)
export const f18 = localFont({
  src: './font/F1.8-Regular.otf',
  variable: '--font-f18',
  display: 'swap',
});