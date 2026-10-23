# Grafika z paczki tekstur

Pliki w tym katalogu pochodzą z paczki tekstur dołączonej do repozytorium
(`26.2.x-Template.zip`, katalog `assets/minecraft/textures/`).

* `vanillaArt.generated.ts` jest **generowany** – nie edytuj go ręcznie.
  Zawiera atlas bloków (256×256), atlas ikon przedmiotów, skórki graczy
  (Steve i Alex) oraz palety kolorów mobów, wszystko w base64.
* Regeneracja:

  ```bash
  node scripts/compile-vanilla-art.mjs                    # czyta zip z repo
  node scripts/compile-vanilla-art.mjs --pack <katalog>    # rozpakowana paczka
  ```

  Po wygenerowaniu warto zajrzeć do `.art-preview/blocks.png` i
  `.art-preview/items.png` – to podglądy atlasów w skali 4×.

Prawa do tekstur należą do autorów paczki (Texture-Packs.com). Gra korzysta
z nich na podstawie pliku dołączonego do repozytorium; przy publikacji
komercyjnej sprawdź warunki licencji paczki.
