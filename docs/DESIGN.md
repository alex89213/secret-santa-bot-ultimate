# Design

The site has one look: a dark evergreen palette with red for Christmas, a little gold, and snow. It's festive in a few deliberate places and quiet everywhere else.

## Color

All colors are CSS custom properties in `src/app/globals.css`. Components use the tokens, never raw values.

| Token                      | Value                         | Used for                                               |
| -------------------------- | ----------------------------- | ------------------------------------------------------ |
| `--bg`                     | `#0f1f1a`                     | Page background                                        |
| `--surface` / `--raised`   | `#172a22` / `#1f3529`         | Cards, top bar, menus                                  |
| `--field`                  | `#1c3229`                     | Inputs and secondary buttons                           |
| `--line` / `--line-strong` | `#2c4538` / `#3d5c4b`         | Borders and dividers                                   |
| `--text` / `--muted`       | `#f3ead8` / `#a3b5aa`         | Body text and secondary text                           |
| `--red`                    | `#ea5e52`                     | Page titles, the recipient's name, links, list numbers |
| `--primary`                | `#c8433a`                     | Primary buttons and the active tab                     |
| `--gold`                   | `#d9ad55`                     | The tree star, ornament cap and pending states         |
| `--good`                   | `#8fcf9f`                     | Completed and matched states                           |
| `--pine` / `--berry`       | `#4f9c66` / `#d6473e`         | Artwork                                                |
| `--snow` / `--snow-edge`   | `#e9f0ea` / translucent black | Snow edge and falling snow                             |

## Type

- **Literata** for headings, the brand and the recipient's name.
- **Geist** for everything else.

Both are under the SIL Open Font License and are self-hosted with `next/font`, so no request goes to a font CDN.

## Artwork

Original flat illustrations in `src/components/decor.tsx`: tree (the logo, and the favicon in `src/app/icon.svg`), Santa hat, holly, ornament and candy cane. Every piece follows the same rules:

- drawn on a 48×48 grid,
- flat fills only, with no outlines, highlights or detail lines,
- built from circles, almond leaves, rounded rectangles and simple curves,
- at most three palette colors,
- any tilt is applied where the piece is placed, never inside the drawing.

Illustrations appear only on standalone pages such as sign-in. App pages keep to the snow.

## Snow

- **Snow edge:** an irregular drift along the top of every page, drawn from one SVG mask layered at two widths so it doesn't visibly repeat.
- **Falling snow:** a canvas behind the page content (`src/components/snowfall.tsx`). Cards are opaque, so flakes pass behind them. It pauses off-screen or in a hidden tab, and holds still for anyone who prefers reduced motion.
- **Snowflake library:** `src/components/snowflakes.ts` lists each flake design with a relative `chance`, a size range and a draw function. Each new flake picks a design by weighted random. Add a design by adding an entry.

## Layout

- A top bar with Home, Wishlist and Servers. Sign-out lives in the account menu.
- Only real things are boxed: exchange cards, the draw, forms. Lists such as servers, people and wishlists are plain rows under a heading.
- Layouts collapse to one column on phones, and the page never scrolls sideways.

## Writing

- Name things the way people think of them: "server", not "group"; "Draw names", "Lock in matches", "Check matches", "Send matches".
- Headings say what's there. No slogans, and no subtitle unless it helps someone act.
- Exchanges show **Drawing names**, **Matched** or **Done**. Past years show **Complete** or **Partial**.
- Forms use visible labels and a short hint only where a field needs explaining. No placeholder examples.
- Avoid pronouns for other people ("See wishlist", not "See her wishlist").
- Confirmations use the app's own dialog and say exactly what will happen.
