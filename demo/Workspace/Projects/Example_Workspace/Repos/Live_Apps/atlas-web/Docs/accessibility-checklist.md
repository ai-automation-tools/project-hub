# Accessibility checklist

Run before any release that changes a page's layout.

- [ ] Every interactive element is reachable and operable from the keyboard
- [ ] Focus is visible on every theme, including the high-contrast one
- [ ] Text contrast is at least 4.5:1, 3:1 for large text
- [ ] Charts have a text summary next to them, not only a tooltip
- [ ] The export dialog returns focus to the button that opened it
- [ ] Nothing moves on its own when `prefers-reduced-motion` is set

The charts item is the one that keeps failing. A tooltip is not a summary.
