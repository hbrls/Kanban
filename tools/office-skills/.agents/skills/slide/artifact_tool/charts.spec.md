## Charts API

### Overview

`slide.charts` attaches charts to a slide. Chart authoring is **string-first**:

- `slide.charts.add("line" | "bar" | "scatter" | "pie" | ...)`
- fills and strokes accept `FillConfig` shorthands (`"accent1"`, `"#FF6600"`, gradients, …)
- options live under typed groups (`barOptions`, `lineOptions`, `scatterOptions`, `mapOptions`, …)

The value returned from `slide.charts.add(...)` is a chart element façade: it has slide placement (`position`) and forwards chart properties (`title`, `series`, `axes`, …).

---

### Quick start (line chart)

```python
chart = slide.charts.add("line")
chart.position = { "left": 40, "top": 60, "width": 640, "height": 320 }

chart.title = "Milky Way Star Birth Rate"
chart.style_index = 1

chart.categories = ["2020", "2021", "2022", "2023"]

series = chart.series.add("Milky Way")
series.values = [1.8, 1.9, 2.0, 2.2]
series.categories = chart.categories
series.stroke = { "width": 2, "style": "solid", "fill": "accent1" }
series.marker.symbol = "circle"
series.marker.size = 6

chart.has_legend = True
chart.legend.position = "bottom"
chart.legend.text_style.font_size = 11
chart.legend.text_style.fill = "text1"
```

---

### Chart types

Common chart types used in tests:

- `"line"`, `"bar"`, `"scatter"`, `"pie"`, `"treemap"`, `"map"`, `"bar3D"`

(`ChartType` supports many more.)

---

### Series basics

Category charts:

```python
chart.categories = ["Q1", "Q2", "Q3", "Q4"]
s = chart.series.add("Revenue")
s.values = [120, 140, 180, 210]
s.categories = chart.categories
```

Scatter charts:

```python
s = chart.series.add("Exoplanets")
s.x_values = [0.03, 0.05, 1.05]
s.values = [251, 230, 265]
chart.scatter_options.style = "marker"
```

---

### Styling shorthands

`FillConfig` shorthands work everywhere:

```python
series.fill = "accent3"
series.stroke = { "width": 1, "style": "solid", "fill": "background1" }


