# Tokens

Three tiers, and a component may only reference the third.

| Tier | Example | Who reads it |
|:---|:---|:---|
| Primitive | `green-500` | Only the semantic tier |
| Semantic | `color-accent` | Only the component tier |
| Component | `button-bg-hover` | Components |

## Why the middle tier exists

Without it, a theme change means editing every component. With it, a theme change is a
diff in one file. That has been worth the extra indirection twice now, which is twice
more than most abstractions earn.
