# Zootropolis bundled 3D assets

All assets in this tree are **CC0 1.0 Public Domain** — no attribution is
legally required, but we credit the authors because it's the right thing
to do.

All Quaternius models were fetched from Poly Pizza's CC0 CDN (the same
files Quaternius publishes via his CC0 bundles). All Kenney models were
extracted from official Kenney CC0 pack zips on kenney.nl.

Every file here was post-processed with `@gltf-transform/cli` to strip
animations, skins, and joint/weight attributes, then quantized so the
mesh fits under the per-file budget. The original pack authors retain
credit; the slimmed-down variants are still CC0.

## Buildings

All five models extracted from Kenney's "City Kit (Commercial)" pack
(low-detail building variants).

- `buildings/small-house.glb` — Kenney, "City Kit (Commercial)"
  (`low-detail-building-a.glb`).
  Source: https://kenney.nl/media/pages/assets/city-kit-commercial/16eb35d771-1753115042/kenney_city-kit-commercial_2.1.zip
  License: CC0.
- `buildings/office.glb` — Kenney, "City Kit (Commercial)"
  (`low-detail-building-b.glb`).
  Source: same zip. License: CC0.
- `buildings/shop.glb` — Kenney, "City Kit (Commercial)"
  (`low-detail-building-c.glb`).
  Source: same zip. License: CC0.
- `buildings/tower.glb` — Kenney, "City Kit (Commercial)"
  (`low-detail-building-d.glb`).
  Source: same zip. License: CC0.
- `buildings/cottage.glb` — Kenney, "City Kit (Commercial)"
  (`low-detail-building-k.glb`).
  Source: same zip. License: CC0.

## Animals

All eight models are CC0 by Quaternius, pulled from the Poly Pizza
CDN (`static.poly.pizza`). Animations/skins stripped, then quantized.

- `animals/fox.glb` — Quaternius, "Animated Animal Pack", Fox.
  Source: https://poly.pizza/m/Bc97C66HKi
  (GLB: https://static.poly.pizza/e18e86df-1692-48d8-ac6e-1e25ab4ad574.glb).
  License: CC0.
- `animals/owl.glb` — Quaternius, "Bird" (generic songbird used as owl
  stand-in; Quaternius has no standalone CC0 owl on Poly Pizza).
  Source: https://poly.pizza/m/gYYC0gYMnw
  (GLB: https://static.poly.pizza/bc6de37a-fdc5-4ef2-85c6-4a2e7b5db9d5.glb).
  License: CC0.
- `animals/bear.glb` — Quaternius, "Animated Animal Pack", Husky (used
  as a bear stand-in; no CC0 Quaternius bear is available — the nearest
  fit is a four-legged mammal. Swap when a real bear appears upstream).
  Source: https://poly.pizza/m/wcWiuEqwzq
  (GLB: https://static.poly.pizza/611d25c7-430f-4bb5-ab2c-d8f5f3cb9712.glb).
  License: CC0.
- `animals/rabbit.glb` — Quaternius, Rabbit.
  Source: https://poly.pizza/m/mKev485XTR
  (GLB: https://static.poly.pizza/0f6aa24f-b37e-4b75-aeec-5e7d71319f7d.glb).
  License: CC0.
- `animals/wolf.glb` — Quaternius, "Animated Animal Pack", Wolf.
  Source: https://poly.pizza/m/P1gU3Qkr9r
  (GLB: https://static.poly.pizza/f1d12388-e39b-4157-b32a-646a1d089fc4.glb).
  License: CC0.
- `animals/cat.glb` — Quaternius, Cat.
  Source: https://poly.pizza/m/2f54vbV0In
  (GLB: https://static.poly.pizza/7ccb71fe-dabb-4a6f-a98a-8992bb5e6bc7.glb).
  License: CC0.
- `animals/dog.glb` — Quaternius, "Farm Animal Pack", Pug.
  Source: https://poly.pizza/m/1gXKv15ik8
  (GLB: https://static.poly.pizza/094335c0-632a-45f5-8583-27d5cab53b54.glb).
  License: CC0.
- `animals/sheep.glb` — Quaternius, "Farm Animal Pack", Sheep.
  Source: https://poly.pizza/m/C39AUXUUes
  (GLB: https://static.poly.pizza/a4bd2c4e-fe71-4dbd-9881-cf3ac8a00bbf.glb).
  License: CC0.

## Nature

Five models from Kenney's "Nature Kit" and one lamppost from Kenney's
"Furniture Kit" (Nature Kit has no standalone lamppost GLB).

- `nature/tree-pine.glb` — Kenney, "Nature Kit" (`tree_cone.glb`).
  Source: https://kenney.nl/media/pages/assets/nature-kit/8334871c74-1677698939/kenney_nature-kit.zip
  License: CC0.
- `nature/tree-oak.glb` — Kenney, "Nature Kit" (`tree_default.glb`).
  Source: same zip. License: CC0.
- `nature/rock.glb` — Kenney, "Nature Kit" (`rock_largeA.glb`).
  Source: same zip. License: CC0.
- `nature/bush.glb` — Kenney, "Nature Kit" (`plant_bush.glb`).
  Source: same zip. License: CC0.
- `nature/fence-post.glb` — Kenney, "Nature Kit" (`fence_simple.glb`).
  Source: same zip. License: CC0.
- `nature/lamppost.glb` — Kenney, "Furniture Kit" (`lampSquareFloor.glb`,
  used as an outdoor lamppost stand-in; Nature Kit has no standalone
  lamppost).
  Source: https://kenney.nl/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip
  License: CC0.

## Furniture

All five models from Kenney's "Furniture Kit".

- `furniture/desk.glb` — Kenney, "Furniture Kit" (`desk.glb`).
  Source: https://kenney.nl/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip
  License: CC0.
- `furniture/chair.glb` — Kenney, "Furniture Kit" (`chairDesk.glb`).
  Source: same zip. License: CC0.
- `furniture/monitor.glb` — Kenney, "Furniture Kit" (`computerScreen.glb`).
  Source: same zip. License: CC0.
- `furniture/lamp.glb` — Kenney, "Furniture Kit" (`lampSquareTable.glb`).
  Source: same zip. License: CC0.
- `furniture/bookshelf.glb` — Kenney, "Furniture Kit" (`bookcaseOpen.glb`).
  Source: same zip. License: CC0.

## Policy

If you add new assets here, they MUST be CC0 (or a more permissive
license). No CC-BY, no MIT-with-attribution-required, no proprietary
assets. Paperclip itself is MIT-licensed; these assets cannot add
restrictions downstream.

Before committing a new asset:

1. Verify the source license is CC0 or public domain (not just "free
   to use" — that's often CC-BY, which we do **not** accept).
2. Strip animations, skins, and textures you don't render; quantize
   positions/normals to stay under the per-file 80 KB budget.
3. Add a line here documenting the exact source URL and author.
