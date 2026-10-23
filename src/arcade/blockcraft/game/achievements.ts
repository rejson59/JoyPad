export interface Achievement {
  id: string;
  title: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'wood', title: 'Pierwsze drewno', text: 'Zdobądź pień drzewa.' },
  { id: 'craft', title: 'Rzemieślnik', text: 'Wytwórz pierwszy przedmiot.' },
  { id: 'pick', title: 'Górnik', text: 'Wytwórz kilof.' },
  { id: 'torch', title: 'Niech się stanie światłość', text: 'Postaw pochodnię.' },
  { id: 'tree', title: 'Leśnik', text: 'Wyhoduj drzewo z sadzonki.' },
  { id: 'farm', title: 'Rolnik', text: 'Zbierz dojrzałą pszenicę.' },
  { id: 'food', title: 'Smacznego', text: 'Zjedz coś.' },
  { id: 'cave', title: 'Pod ziemią', text: 'Zejdź głęboko do jaskini.' },
  { id: 'coal', title: 'Czarne złoto', text: 'Wydobądź węgiel.' },
  { id: 'iron', title: 'Epoka żelaza', text: 'Wytop sztabkę żelaza.' },
  { id: 'diamond', title: 'Diamenty!', text: 'Znajdź diament.' },
  { id: 'bed', title: 'Dobranoc', text: 'Prześpij noc w łóżku.' },
  { id: 'night', title: 'Przetrwałeś noc', text: 'Dożyj drugiego dnia.' },
  { id: 'zombie', title: 'Łowca nocy', text: 'Pokonaj zombie.' },
  { id: 'creeper', title: 'Sssss…', text: 'Pokonaj creepera, zanim wybuchnie.' },
  { id: 'boom', title: 'Pirotechnik', text: 'Odpal TNT.' },
  { id: 'home', title: 'Pod własnym dachem', text: 'Postaw drzwi.' },
  { id: 'stash', title: 'Schowek', text: 'Postaw skrzynię.' },
  { id: 'climb', title: 'W górę', text: 'Wejdź po drabinie.' },
  { id: 'shear', title: 'Fryzjer', text: 'Ostrzyż owcę nożycami.' },
  { id: 'loot', title: 'Znalazca', text: 'Otwórz skrzynię ukrytą w jaskiniach.' },
  { id: 'string', title: 'Sieć-pająk', text: 'Zdobądź strunę z pająka.' },
  { id: 'archer', title: 'Łucznik', text: 'Wystrzel strzałę z łuku.' },
  { id: 'skeleton', title: 'Kościany łowca', text: 'Pokonaj szkieletowego strzelca.' },
  { id: 'foundry', title: 'Hutnik', text: 'Wytwórz blok żelaza.' },
  { id: 'wolf', title: 'Watahą silniejszy', text: 'Zatamej wilka kawałkiem mięsa.' },
  { id: 'armor', title: 'W pełnym zbroju', text: 'Załóż cztery elementy pancerza naraz.' },
  { id: 'xp10', title: 'Weteran', text: 'Osiągnij poziom doświadczenia 10.' },
  { id: 'guardian', title: 'Strażnik', text: 'Przyłap cios lub strzałę tarczą.' },
  { id: 'lapis', title: 'Błękitna ruda', text: 'Zdobądź lazuryt.' },
  { id: 'cane', title: 'Trzcinowy pole', text: 'Zetnij trzcinę cukrową.' },
  { id: 'book', title: 'Mól książkowy', text: 'Wytwórz książkę.' },
  { id: 'table', title: 'Zaklinacz', text: 'Postaw stół zaklęć.' },
  { id: 'enchant', title: 'Pierwsze zaklęcie', text: 'Zaklnij przedmiot w stole zaklęć.' },
  { id: 'enchant_master', title: 'Mistrz zaklęć', text: 'Wytwarzaj zaklęcie na poziomie 4 lub wyżej.' },
  // 1.6 „Wioska”
  { id: 'village', title: 'Osada', text: 'Traf na wioskę i poznaj jej mieszkańców.' },
  { id: 'trade', title: 'Handlarz', text: 'Wymień coś z mieszkańcem.' },
  { id: 'merchant', title: 'Kupiec', text: 'Dokonaj 25 wymian.' },
  { id: 'emerald', title: 'Zielone złoto', text: 'Zdobądź szmaragd.' },
  { id: 'golem', title: 'Żelazny stróż', text: 'Spotkaj żelaznego golema.' },
  { id: 'bell', title: 'Bij dzwon', text: 'Zadzwoń dzwonem na wioskowym placu.' },
  // 1.7 „Nether & Redstone”
  { id: 'redstone', title: 'Inżynier', text: 'Zdobądź czerwony proszek i zbuduj układ redstone.' },
  { id: 'nether', title: 'Do Netheru', text: 'Wejdź przez portal do Netheru.' },
  { id: 'portal', title: 'Budowniczy portali', text: 'Zbuduj i zapal portal Netheru.' },
  { id: 'quartz', title: 'Biały kamień', text: 'Wydobądź kwarc z Netheru.' },
  { id: 'piston', title: 'Mechanik', text: 'Wytwórz tłok.' },
  { id: 'slime', title: 'Szlamowy skok', text: 'Odbij się na bloku szlamu.' },
  { id: 'enderman', title: 'Spójrz mu w oczy', text: 'Pokonaj Endermana.' },
  { id: 'ghast', title: 'Łza Ghasta', text: 'Zdobądź łzę Ghasta.' },
  // 1.9 „Czysty ekwipunek”
  { id: 'pearl', title: 'Skok przez wymiar', text: 'Zteleportuj się perłą Endu.' },
  // 2.2 „Szlak odkrywcy”
  { id: 'cartographer', title: 'Kartograf', text: 'Zaznacz swój pierwszy punkt podróży.' },
  // 2.3 „Wyprawa i ratunek”
  { id: 'fisher', title: 'Pierwszy zarobek', text: 'Złów pierwszą rybę na wędkę.' },
  { id: 'angler', title: 'Wędkarz', text: 'Złów pięć sztuk na wędkę.' },
  { id: 'chef', title: 'Smażenie ryb', text: 'Upiecz rybę w piecu lub na ognisku.' },
  { id: 'surveyor', title: 'Obserwator', text: 'Przyjrzyj się okolicy przez lornetę.' },
  { id: 'smith', title: 'Kowal', text: 'Scal dwa uszkodzone narzędzia w kowadle.' },
  { id: 'namer', title: 'Nadany imię', text: 'Zmień nazwę przedmiotu w kowadle.' },
  { id: 'undying', title: 'Nieśmiertelny', text: 'Totem Ratowania uratuje cię od śmierci.' },
  // 2.4 „Godzina alchemika”
  { id: 'alchemist', title: 'Pierwsze warzenie', text: 'Zawrzyj pierwszy napój na statywie alchemicznym.' },
  { id: 'tonic', title: 'Ziołowy tonik', text: 'Wypij napój leczący.' },
  { id: 'fireproof', title: 'Ognioodporny', text: 'Wypij napój ognioodporności i wejdź do lawy.' },
  { id: 'potioneer', title: 'Mistrz eliksirów', text: 'Wypij sześć różnych napojów.' },
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
