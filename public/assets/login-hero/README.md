# Login Hero Image Library

Curated hero images for the login page, selected by detected client discipline/industry.

## Folder structure

```
login-hero/
  accounting/       Accounting, bookkeeping & tax advisory
  legal/            Law firms & legal services
  marketing/        Marketing, creative & design agencies
  consulting/       Management, strategy & fractional exec firms
  realestate/       Real estate, property mgmt & rentals
  technology/       SaaS, dev tools & tech startups
  finance/          Financial planning, wealth mgmt & insurance
  healthcare/       Healthcare providers, clinics & wellness
  education/        EdTech, coaching, tutoring & training
  operations/       Internal ops, HR, IT & back-office teams
  generic/          Fallback — used when discipline is unknown
```

## Naming convention

```
<discipline>/01.jpg
<discipline>/02.jpg
...
<discipline>/12.jpg
```

- Sequential two-digit numbering starting at `01`.
- Prefer `.jpg` (smaller file size). Use `.png` only if transparency is needed.
- 6-12 images per discipline.

## Image requirements

| Property        | Requirement                                          |
|-----------------|------------------------------------------------------|
| Min width       | 1600 px                                              |
| Aspect ratio    | Works when cropped to ~1:1 (the login card is tall)  |
| Format          | `.jpg` preferred, `.png` acceptable                  |
| Max file size   | 500 KB target, 1 MB hard cap                         |
| Content         | Photograph or abstract — see notes per discipline    |

## Content rules

- **No text overlays** — the image sits behind no UI text, but text would clash with branding.
- **No UI screenshots** — looks fake and dates quickly.
- **No logos or watermarks** — must be royalty-free / properly licensed.
- **No "poster" layouts** — avoid centered compositions that fight with the login form beside it.
- **Avoid faces as the focal point** — generic feel > specific people.
- **Crop-safe** — the important content should survive center-crop to various tall aspect ratios.

## Discipline-specific guidance

| Discipline    | Style         | Mood / Subject Matter                                        |
|---------------|---------------|--------------------------------------------------------------|
| accounting    | Photo         | Clean desk, laptop + papers, warm tones, orderly workspace   |
| legal         | Photo         | Book shelves, marble, classic architecture, muted warm tones |
| marketing     | Photo/Abstract| Bold colors, creative workspace, geometric art, mood boards  |
| consulting    | Photo         | Glass conference room, skyline, whiteboard, collaborative    |
| realestate    | Photo         | Architecture, modern interior/exterior, doorway, residential |
| technology    | Abstract      | Gradients, geometric mesh, dark UI patterns, neon accents    |
| finance       | Photo/Abstract| Data viz motifs, financial district, polished & secure       |
| healthcare    | Photo         | Soft natural light, plants, calming clinical, pastel tones   |
| education     | Photo         | Bright & open, notebooks, collaborative learning, warm light |
| operations    | Photo         | Organized workspace, kanban board, team tools, productive    |
| generic       | Abstract/Photo| Neutral — soft gradient, architectural minimalism, universal |

## Selection logic

The runtime picks an image deterministically:

```
hash(domain) % imageCount → index → <discipline>/<index + 1>.jpg
```

Same domain always produces the same hero image. If discipline detection
confidence is below threshold, the `generic/` folder is used. If no images
exist in a folder yet, the gradient fallback fires (existing pipeline).
