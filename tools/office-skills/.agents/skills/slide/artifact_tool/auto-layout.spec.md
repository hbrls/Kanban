## Auto Layout API

### Overview

Auto layout arranges existing shapes within a frame using simple constraints (direction, alignment, gaps, padding). It is designed to:

- keep spacing consistent as content changes
- preserve each shape’s existing `width`/`height` (it only mutates `left`/`top`)

NOTE: All dimensions must be specified in terms of pixels.

### Entry points

```python
from presentation_artifact_tool import AutoLayout, AutoLayoutOptions

slide.auto_layout(items: list[Shape], options: AutoLayoutOptions): None
AutoLayout.apply(slide, items, options): None
```

### Options

```python
from presentation_artifact_tool import AutoLayoutAlign, AutoLayoutDirection, AutoLayoutOptions

slide.auto_layout(
    [shape_a, shape_b, shape_c],
    AutoLayoutOptions(
        direction=AutoLayoutDirection.horizontal, # or .vertical
        frame="slide",                            # "slide" | Shape | { left, top, width, height }
        align=AutoLayoutAlign.topCenter,          # see enum values below
        horizontalGap=24,                         # int | float | "auto"
        verticalGap=16,                           # int | float | "auto"
        horizontalPadding=40,
        verticalPadding=32,
    )
)
```

`AutoLayoutAlign` supports:

- `topLeft`, `topCenter`, `topRight`
- `left`, `center`, `right`
- `bottomLeft`, `bottomCenter`, `bottomRight`

Notes:

- When `frame: "slide"`, the slide bounds are used as the layout frame.
- For a single item with `align: "center"`, direction and gaps are ignored.

Errors:

- Throws if `items` contains shapes from a different slide.
- Throws if `frame` is invalid or has non-positive dimensions.


### See also

- [Shapes API](#shapes-api) — author shapes prior to layout.
- [Slide API](#slide-api) — slide frame, background, and export.

## Examples

The snippets below assume an existing `Slide` facade (`slide`) with access to helpers such as `ShapeGeometry`, `Fill`, and `Color`. Only the statements relevant to auto layout are shown.

### Horizontal layout inside a container frame

Use a rectangle as the frame and distribute three metrics horizontally.

```python
panel = slide.shapes.add(
    PresetShapeGeometryConfig(
        geometry="rect",
        position=PositionConfig(left=80, top=120, width=640, height=200),
    )
)
panel.fill = "accent2"

labels = ["MRR", "Active Users", "NPS Score"]
metrics = []

