# My Maps Coordinates Extractor

Tampermonkey/Violentmonkey userscript. Extracts name + lat/lng from every marker in a Google My Maps map and exports it as CSV.

## Why

Google My Maps geocodes addresses into pin positions fine. But when you export the map to KML, it **doesn't include `<coordinates>`**. Only the `<address>` string. So when you import that KML into Organic Maps, OsmAnd, Locus or anything else, pins end up in the wrong place or vanish.

This script reads the coordinates My Maps already computed internally and gives them to you as a CSV.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install script from above on the script manager of your choice.

## Use

1. Open your map at [google.com/maps/d](https://www.google.com/maps/d) in edit mode.
2. Make sure the **side panel is open** with markers listed.
3. Click the blue button that appears in the top-right: **"▶ Extract coords"**.
4. Wait. Progress shows in the console (F12).
5. When done, `markers_YYYY-MM-DD.csv` downloads with `name,lat,lng,address` columns.

The button turns into **STOP** while running. Click it to stop and download whatever's been processed.

## What to do with the CSV

1. Open your map in My Maps, click **"Add layer"**.
2. In the new layer, click **"Import"** and upload the CSV.
3. When asked how to position markers, choose **lat** and **lng** columns (not the address).
4. You now have the original (address-geocoded) pins and the new (coordinate) pins. Toggle layers to compare.
5. Export the map to KML. This time it **will** include `<coordinates>`.
6. Import that KML into Organic Maps, OsmAnd, or whatever you use. Pins stay put.

## How it works

- Iterates over side panel items (`[fl_id]`), not map pins. The panel is more reliable and doesn't depend on zoom.
- Fires the full event sequence: `pointerdown → mousedown → pointerup → mouseup → click`. A plain `.click()` doesn't work; My Maps listens for pointerdown/mousedown and ignores clicks.
- Reads the popup and extracts coordinates. Three strategies, first match wins: a Google Maps URL in the popup, decimal pairs with valid lat/lng ranges, or DMS.
- When visible items run out, scrolls the panel so Google loads virtualized markers.
- Exports CSV.

## Known limitations

- If several markers share the exact same address, My Maps groups them into one pin. The script processes them as separate items but they'll share the first one's coordinates.
- Google rotates CSS classes every few months. If the script reports 0 items, open an issue with the HTML of one side-panel entry.
- `[fl_id]` and `[class*="r4nke"]` are the selectors that work today (October 2026).

## License

MIT.
