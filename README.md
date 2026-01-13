# File Line Counter

Shows the number of lines in each file in the Explorer.

## Features

- 📊 **Badge in Explorer** - Shows line count next to each file
- 📁 **Separate Tree View** - "Line Count" view with `[lineCount]` format
- 🎨 **Color Indicators** - Configurable colors for different thresholds
- ⚙️ **Fully Configurable** - Set your own thresholds and colors

## Configuration

In Settings, search for `fileLineCounter.thresholds` or add to `settings.json`:

```json
"fileLineCounter.thresholds": [
  { "lines": 100, "color": "charts.green" },
  { "lines": 300, "color": "charts.blue" },
  { "lines": 500, "color": "charts.yellow" },
  { "lines": 1000, "color": "charts.red" }
]
```

**Default:** 500 = yellow, 1000 = red

## Available Colors

Colors are VS Code **ThemeColor** names:

### Alert Colors
| Color | Name |
|-------|------|
| 🔴 Red | `editorError.foreground` |
| 🟡 Yellow/Orange | `editorWarning.foreground` |
| 🔵 Blue | `editorInfo.foreground` |

### Chart Colors
| Color | Name |
|-------|------|
| 🔴 Red | `charts.red` |
| 🟠 Orange | `charts.orange` |
| 🟡 Yellow | `charts.yellow` |
| 🟢 Green | `charts.green` |
| 🔵 Blue | `charts.blue` |
| 🟣 Purple | `charts.purple` |

### Git Colors
| Color | Name |
|-------|------|
| 🟡 Modified | `gitDecoration.modifiedResourceForeground` |
| 🟢 Added | `gitDecoration.addedResourceForeground` |
| 🔴 Deleted | `gitDecoration.deletedResourceForeground` |

## Badge Format

| Lines | Badge |
|-------|-------|
| 0-99 | Full number (e.g., `42`) |
| 100-999 | Hundreds (e.g., `5H` = 500s) |
| 1000-9999 | Thousands (e.g., `2K`) |
| 10000+ | Thousands (e.g., `15K`) |