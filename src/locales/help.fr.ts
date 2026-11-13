/**
 * Aide en français pour chaque saisie : ce que c’est et où trouver la valeur.
 * Mêmes clés que help.en.ts.
 */
import type { Help } from './help.en';

export const help: Help = {
  // ---------------------------------------------------------------- lieu & période
  location: {
    what: 'L’emplacement du bâtiment. La météo horaire et les données d’ensoleillement sont téléchargées pour ces coordonnées.',
    find: 'Recherchez votre commune ou votre adresse. Ou copiez les coordonnées depuis une carte (dans Google Maps, faites un clic droit sur la maison puis cliquez sur les chiffres).',
  },
  countryCode: {
    what: 'Code pays à deux lettres (par ex. FR, BE, DE) utilisé pour récupérer les prix de l’électricité des ménages auprès d’Eurostat.',
    find: 'Rempli automatiquement quand vous choisissez un résultat de recherche. Eurostat couvre les pays de l’UE/EEE et quelques voisins ; ailleurs, saisissez votre propre tarif sous Prix de l’électricité.',
  },
  period: {
    what: 'Les jours à simuler. Une période plus longue lisse les hivers et les étés inhabituels.',
    find: 'Cinq années complètes ou plus donnent une image fiable. Laissez « Au » vide pour toujours calculer jusqu’à hier.',
  },

  // ---------------------------------------------------------------- bâtiment – chauffage
  heatingIndoorTemp: {
    what: 'La température que vous maintenez à l’intérieur en hiver.',
    find: 'Le réglage de votre thermostat ; 19–21 °C est courant. Chaque degré en plus ajoute environ 6 % à l’énergie de chauffage.',
  },
  designOutdoorTemp: {
    what: 'La température extérieure la plus froide pour laquelle le chauffage est dimensionné (la « température extérieure de base »). Les déperditions ci-dessous sont données à cette température.',
    find: 'Indiquée dans votre calcul des déperditions ou votre étude thermique (EN 12831). Sinon, utilisez le tableau de la norme nationale pour votre commune, ou demandez à un installateur. C’est à peu près la température la plus froide atteinte quelques jours par an, par ex. −12 à −16 °C en Europe centrale.',
  },
  designTransmissionLossW: {
    what: 'La chaleur perdue à travers les murs, la toiture, le plancher et les fenêtres quand il fait aussi froid dehors que la température de base.',
    find: 'Le total des « déperditions par transmission » (Φ_T) dans un calcul des déperditions pièce par pièce réalisé par un installateur ou un bureau d’études thermiques. Si vous ne connaissez que les déperditions totales, utilisez plutôt le champ de remplacement.',
  },
  designVentilationLossW: {
    what: 'La chaleur perdue pour réchauffer l’air extérieur qui entre par la ventilation et les infiltrations, à la température de base.',
    find: 'Les « déperditions par renouvellement d’air » (Φ_V) dans le même rapport. Estimation grossière : 0,34 × renouvellements d’air par heure × volume de la maison en m³ × (température intérieure − température de base), en W. Une VMC double flux les réduit fortement.',
  },
  designHeatLoadOverrideKw: {
    what: 'Les déperditions thermiques de base totales du bâtiment, si vous n’avez qu’un seul chiffre. Laissez vide pour utiliser transmission + renouvellement d’air.',
    find: 'D’une étude thermique ou du dimensionnement de la pompe à chaleur dans un devis d’installateur (sans majoration de relance). Estimation à partir de la consommation passée : énergie de chauffage annuelle en kWh (gaz en m³ × ~10 × rendement de chaudière ~0,9, ou litres de fioul × ~10) ÷ 2 000 heures à pleine charge. Ou surface × W/m² : ~30–40 en construction neuve, ~50–70 en rénové, 100+ non isolé.',
  },

  // ---------------------------------------------------------------- pompes à chaleur
  pumpCount: {
    what: 'Le nombre de pompes à chaleur identiques qui chauffent et rafraîchissent la maison.',
    find: 'Comptez les unités extérieures utilisées pour le chauffage. Ne comptez pas une unité servant uniquement à l’eau chaude sanitaire.',
  },
  heatCapMinus7: {
    what: 'La puissance calorifique d’une pompe à chaleur à −7 °C dehors, à la température de départ de votre installation. En dessous de −7 °C, le modèle garde cette valeur.',
    find: 'Dans la fiche technique de la pompe à chaleur, au tableau des puissances à « A-7/W35 », « A-7/W45 » ou « A-7/W55 ». Choisissez la valeur W la plus proche de votre température de départ (plancher chauffant ≈ 35 °C, radiateurs 45–55 °C). Prenez la puissance maximale, pas la nominale.',
  },
  heatCapPlus7: {
    what: 'La puissance calorifique d’une pompe à chaleur à +7 °C dehors. Entre −7 et +7 °C, le modèle trace une droite.',
    find: 'Même tableau de la fiche technique, à « A7/W35 », « A7/W45 » ou « A7/W55 ». A7/W35 est généralement la valeur mise en avant.',
  },
  copMinus7: {
    what: 'Le COP (chaleur produite ÷ électricité consommée) à −7 °C dehors. Plus il est élevé, mieux c’est.',
    find: 'Même tableau de la fiche technique que la puissance à −7 °C, même température de départ (points d’essai EN 14511). En conditions réelles, le COP d’hiver est souvent 5–10 % plus bas à cause des dégivrages.',
  },
  copPlus7: {
    what: 'Le COP à +7 °C dehors.',
    find: 'Fiche technique, à A7 et à votre température de départ. Pour une vérification rapide : un SCOP de 4 à 35 °C correspond généralement à un COP d’environ 4,5–5 à A7/W35.',
  },
  heatCapFactor: {
    what: 'Augmente ou réduit la puissance de chauffage pour tester ce qui se passe avec moins de puissance.',
    find: '1 = les valeurs de la fiche technique. Utilisez 0,9 pour tenir compte des dégivrages, du vieillissement ou d’une marge de sécurité.',
  },
  coolCapA35: {
    what: 'La puissance frigorifique d’une pompe à chaleur à 35 °C dehors avec de l’eau glacée à 7 °C (A35/W7).',
    find: 'Tableau de rafraîchissement de la fiche technique à « A35/W7 ». Si vous rafraîchissez par le plancher ou des plafonds rafraîchissants (eau à ~18 °C), prenez plutôt la valeur A35/W18 ; elle est plus élevée.',
  },
  eerA35: {
    what: 'L’EER (froid produit ÷ électricité consommée) à A35/W7. Plus il est élevé, mieux c’est.',
    find: 'Même tableau de rafraîchissement de la fiche technique (EN 14511). Prenez A35/W18 si vous rafraîchissez par le plancher chauffant.',
  },
  coolCapLossPerK: {
    what: 'De combien la puissance frigorifique baisse pour chaque °C au-dessus de 35 °C dehors (0,01 = 1 % par °C).',
    find: 'Si la fiche technique indique A40 ou A43 : (1 − puissance à A40 ÷ puissance à A35) ÷ 5. Sinon, gardez 0,01.',
  },
  eerLossPerK: {
    what: 'De combien l’EER baisse pour chaque °C au-dessus de 35 °C dehors (0,02 = 2 % par °C).',
    find: 'Même méthode que pour la perte de puissance, avec les colonnes EER. Sinon, gardez 0,02.',
  },
  fanCoilCapKw: {
    what: 'Le maximum de froid que vos émetteurs intérieurs peuvent fournir aux pièces, quoi que la pompe à chaleur puisse produire. Le modèle ne rafraîchit jamais au-delà.',
    find: 'Additionnez la puissance frigorifique totale nominale de tous les ventilo-convecteurs à votre température d’eau (par ex. 7/12 °C), d’après leurs fiches techniques. Pour un plancher ou plafond rafraîchissant, comptez environ 20–40 W par m² de surface rafraîchie.',
  },
  coolCapFactor: {
    what: 'Augmente ou réduit le froid disponible pour tester ce qui se passe avec moins de puissance.',
    find: '1 = selon les caractéristiques. Utilisez 0,8 pour voir l’effet de 20 % de froid en moins.',
  },

  // ---------------------------------------------------------------- charges de rafraîchissement
  coolingThreshold: {
    what: 'Le rafraîchissement démarre quand la température extérieure moyenne de jour ou de nuit dépasse cette valeur, et maintient la maison à cette température. Entre la consigne de chauffage et cette valeur, l’installation est à l’arrêt.',
    find: 'Votre réglage de thermostat en été ; 24–26 °C est courant.',
  },
  hotDayThreshold: {
    what: 'Uniquement pour les statistiques : un jour « très chaud » compte au moins une heure à cette température ou au-dessus.',
    find: 'Choisissez une température qui compte pour vous, par ex. 30 °C ou la température extérieure de base d’été de votre région.',
  },
  coolTransmissionKwK: {
    what: 'La chaleur qui entre par les murs, la toiture et les fenêtres pour chaque °C d’écart entre l’extérieur plus chaud et l’intérieur (kW par kelvin).',
    find: 'Le coefficient de transmission H_T (W/K) d’une étude thermique, ÷ 1000. Ou estimez-le : déperditions par transmission de base en W ÷ (température intérieure − température de base) ÷ 1000 ; par ex. 7 800 ÷ 32 ÷ 1000 ≈ 0,24.',
  },
  coolVentilationKwK: {
    what: 'La chaleur apportée par l’air extérieur pour chaque °C où il fait plus chaud dehors (kW par kelvin).',
    find: 'H_V (W/K) d’une étude thermique, ÷ 1000. Ou estimez-le : 0,34 × renouvellements d’air par heure × volume en m³ ÷ 1000, ou déperditions par renouvellement d’air de base ÷ (température intérieure − température de base) ÷ 1000.',
  },
  internalGainsKw: {
    what: 'La chaleur moyenne dégagée à l’intérieur par les occupants, les appareils et l’éclairage.',
    find: 'Généralement 2–5 W par m² de surface, soit environ 0,3–0,8 kW pour une maison familiale.',
  },
  windowSolarFactor: {
    what: 'Augmente ou réduit l’ensoleillement qui entre par les fenêtres.',
    find: '1 = les surfaces solaires telles que saisies. Essayez 1,5 pour plus de soleil que prévu (par ex. stores laissés ouverts) ou 0,5 pour une bonne protection solaire extérieure.',
  },
  opaqueSolarFactor: {
    what: 'Augmente ou réduit la chaleur que le soleil apporte aux murs et à la toiture.',
    find: '1 = tel que saisi. Augmentez-le pour des toitures sombres et mal isolées.',
  },
  airflowM3h: {
    what: 'L’air extérieur qui entre dans la maison par heure (ventilation plus infiltrations). Sert à calculer combien d’humidité doit être retirée en été.',
    find: 'Le réglage de votre VMC, ou environ 0,3–0,5 × le volume de la maison en m³ en ventilation naturelle.',
  },
  indoorRH: {
    what: 'L’humidité relative intérieure visée en été, en fraction (0,5 = 50 %). Un air extérieur plus humide que cela ajoute une charge de déshumidification.',
    find: '0,5 est courant pour le confort. Augmentez-la si un air un peu plus lourd ne vous gêne pas.',
  },
  dehumidFactor: {
    what: 'Augmente ou réduit l’énergie dépensée pour retirer l’humidité de l’air entrant.',
    find: '1 = ventilo-convecteurs qui déshumidifient. Mettez 0 pour un plancher ou plafond rafraîchissant, qui fonctionne au-dessus du point de rosée et ne déshumidifie pas.',
  },

  // ---------------------------------------------------------------- confort de nuit
  comfortEnabled: {
    what: 'Ajoute un rafraîchissement nocturne supplémentaire d’une partie de la maison (en général les chambres) à une température plus basse, comptabilisé à part.',
    find: 'Activez-le si vous rafraîchissez les chambres la nuit en dessous de la consigne de rafraîchissement normale.',
  },
  comfortTargetTemp: {
    what: 'La température de nuit souhaitée dans ces pièces.',
    find: 'Le réglage nocturne du thermostat de vos chambres, par ex. 22–23 °C.',
  },
  comfortAreaM2: {
    what: 'La surface des pièces rafraîchies à la consigne de nuit.',
    find: 'Additionnez les surfaces des chambres d’après le plan.',
  },
  totalFloorAreaM2: {
    what: 'La surface chauffée totale. La charge de confort de nuit correspond à la part de cette surface dans la charge de rafraîchissement de toute la maison.',
    find: 'D’après le plan, le DPE ou l’annonce immobilière (surface habitable chauffée).',
  },

  // ---------------------------------------------------------------- surfaces solaires (colonnes)
  winArea: {
    what: 'La surface vitrée effective pour l’ensoleillement dans chaque orientation : à combien de m² de surface captant « pleinement » le soleil les fenêtres équivalent.',
    find: 'Surface vitrée × facteur solaire g × facteur d’ombrage. Le facteur solaire g figure sur la fiche des fenêtres (≈ 0,5–0,6 en double ou triple vitrage). Facteur d’ombrage : 1 sans ombrage, ~0,5 avec avancée de toit, ~0,2–0,3 avec stores extérieurs fermés. Par ex. 6 m² de vitrage sud × 0,55 × 0,85 ≈ 2,8.',
  },
  opqArea: {
    what: 'La surface effective pour le soleil qui chauffe les murs et la toiture dans chaque orientation. Elle est petite, car l’isolation laisse passer peu de cette chaleur.',
    find: 'Surface × coefficient U × absorptivité de la surface (≈ 0,6, plus pour les surfaces sombres) × 0,04. Par ex. 60 m² de mur × 0,25 × 0,6 × 0,04 ≈ 0,36. Votre étude thermique peut l’indiquer comme surface de captage solaire effective.',
  },
  roofArea: {
    what: 'La surface effective captant le soleil de la toiture ou des fenêtres de toit (surfaces horizontales).',
    find: 'Fenêtres de toit : surface vitrée × facteur solaire g × ombrage. Toiture : surface × U × absorptivité × 0,04, selon la même méthode que pour les murs.',
  },
  irLoss: {
    what: 'La chaleur que la maison rayonne vers le ciel froid (kW). Elle réduit légèrement la charge de rafraîchissement.',
    find: 'En général 0–0,5 kW pour une maison. Laissez la valeur telle quelle si vous ne la connaissez pas.',
  },

  // ---------------------------------------------------------------- prix
  band: {
    what: 'Eurostat publie les prix des ménages par tranche de consommation annuelle. Les gros consommateurs paient moins cher le kWh.',
    find: 'Choisissez la tranche correspondant à la consommation annuelle de tout votre foyer, pompe à chaleur comprise (sur votre facture d’électricité). Les logements avec pompe à chaleur sont généralement à 5 000–14 999 kWh ou ≥ 15 000 kWh.',
  },
  fallbackTariff: {
    what: 'Votre prix actuel du kWh, toutes taxes comprises. Il est utilisé pour les semestres sans prix Eurostat, ou pour tous les semestres si votre pays n’a pas de données Eurostat. Vide = le dernier prix Eurostat.',
    find: 'Sur votre facture d’électricité : total de tous les montants au kWh (énergie + acheminement + taxes et contributions) ÷ kWh consommés. Ne comptez pas l’abonnement mensuel fixe. Pour un tarif dynamique ou indexé sur le marché, prenez votre moyenne.',
  },
  priceOverrides: {
    what: 'Remplace le prix d’un semestre, par ex. par ce que vous avez réellement payé.',
    find: 'D’après vos factures de ce semestre : montants au kWh ÷ kWh. Laissez vide pour utiliser Eurostat.',
  },
};
