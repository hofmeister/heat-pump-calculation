/**
 * Italian help texts. Must have exactly the same keys as help.en.ts.
 */
import type { Help } from './help.en';

export const help: Help = {
  // ---------------------------------------------------------------- location & period
  location: {
    what: 'Dove si trova l’edificio. Per queste coordinate vengono scaricati i dati orari di meteo e irraggiamento solare.',
    find: 'Tocca «Usa la mia posizione» (il browser chiede prima il permesso) oppure cerca il tuo comune o indirizzo. In alternativa copia le coordinate da una mappa (in Google Maps, clic destro sulla casa e clic sui numeri).',
  },
  countryCode: {
    what: 'Codice paese di due lettere (es. DE, DK, IT) usato per scaricare da Eurostat i prezzi dell’elettricità per le famiglie.',
    find: 'Si compila da solo quando scegli un risultato della ricerca. Eurostat copre i paesi UE/SEE e alcuni paesi vicini; altrove, inserisci la tua tariffa in Prezzi dell’elettricità.',
  },
  period: {
    what: 'I giorni da simulare. Periodi più lunghi compensano inverni ed estati anomali.',
    find: 'Cinque o più anni interi danno un quadro attendibile. Lascia vuoto “A” per arrivare sempre fino a ieri.',
  },

  // ---------------------------------------------------------------- building – heating
  heatingIndoorTemp: {
    what: 'La temperatura che mantieni in casa d’inverno.',
    find: 'L’impostazione del termostato; 20–21 °C è tipico. Ogni grado in più aggiunge circa il 6 % all’energia per il riscaldamento.',
  },
  designOutdoorTemp: {
    what: 'La temperatura esterna più fredda per cui è dimensionato il riscaldamento (la “temperatura esterna di progetto”). Le dispersioni qui sotto sono riferite a questa temperatura.',
    find: 'Indicata nel calcolo del carico termico o nella relazione energetica (EN 12831). Altrimenti usa la tabella della norma nazionale per il tuo comune, o chiedi a un installatore. Corrisponde più o meno alla temperatura più bassa raggiunta in pochi giorni all’anno, es. da −12 a −16 °C in Europa centrale.',
  },
  designTransmissionLossW: {
    what: 'Calore perso attraverso pareti, tetto, pavimento e finestre quando fuori c’è la temperatura di progetto.',
    find: 'Il totale delle “dispersioni per trasmissione” (Φ_T) nel calcolo del carico termico stanza per stanza fatto da un installatore o da un termotecnico. Se conosci solo il carico termico totale, usa invece il campo di sostituzione.',
  },
  designVentilationLossW: {
    what: 'Calore perso per riscaldare l’aria esterna che entra con la ventilazione e gli spifferi, alla temperatura di progetto.',
    find: 'Le “dispersioni per ventilazione” (Φ_V) nella stessa relazione. Stima approssimativa: 0,34 × ricambi d’aria all’ora × volume della casa in m³ × (temperatura interna − di progetto), in W. Una ventilazione meccanica con recupero di calore le riduce molto.',
  },
  designHeatLoadOverrideKw: {
    what: 'Il carico termico totale dell’edificio alla temperatura di progetto, se hai un solo numero. Lascia vuoto per usare trasmissione + ventilazione.',
    find: 'Da una relazione sul carico termico o dal dimensionamento della pompa di calore nel preventivo dell’installatore (senza margine per la ripresa). Stima dai consumi passati: energia annua per riscaldamento in kWh (m³ di metano × ~10 × rendimento caldaia ~0,9, oppure litri di gasolio × ~10) ÷ 2.000 ore a pieno carico. Oppure superficie × W/m²: ~30–40 nuova costruzione, ~50–70 ristrutturata, 100+ non isolata.',
  },

  // ---------------------------------------------------------------- heat pumps
  pumpCount: {
    what: 'Quante pompe di calore identiche riscaldano e raffrescano la casa.',
    find: 'Conta le unità esterne usate per il riscaldamento degli ambienti. Escludi quelle usate solo per l’acqua calda sanitaria.',
  },
  heatCapMinus7: {
    what: 'Potenza termica di una pompa di calore con −7 °C all’esterno, alla temperatura di mandata del tuo impianto. Sotto −7 °C il modello mantiene questo valore.',
    find: 'Nella scheda tecnica o nel manuale dati della pompa di calore, nella tabella delle potenze a “A-7/W35”, “A-7/W45” o “A-7/W55”. Scegli il valore W più vicino alla tua temperatura di mandata (pavimento radiante ≈ 35 °C, radiatori 45–55 °C). Usa la potenza massima, non quella nominale.',
  },
  heatCapPlus7: {
    what: 'Potenza termica di una pompa di calore con +7 °C all’esterno. Tra −7 e +7 °C il modello traccia una linea retta.',
    find: 'Stessa tabella della scheda tecnica, a “A7/W35”, “A7/W45” o “A7/W55”. A7/W35 è di solito il dato principale dichiarato.',
  },
  copMinus7: {
    what: 'COP (calore prodotto ÷ elettricità consumata) con −7 °C all’esterno. Più alto è meglio.',
    find: 'Stessa tabella della scheda tecnica della potenza a −7 °C, stessa temperatura di mandata (punti di prova EN 14511). In inverno il COP reale è spesso del 5–10 % più basso a causa degli sbrinamenti.',
  },
  copPlus7: {
    what: 'COP con +7 °C all’esterno.',
    find: 'Scheda tecnica, ad A7 e alla tua temperatura di mandata. Come verifica approssimativa: uno SCOP di 4 a 35 °C corrisponde di solito a un COP di circa 4,5–5 ad A7/W35.',
  },
  heatCapFactor: {
    what: 'Aumenta o riduce la potenza termica per vedere cosa succede con meno potenza.',
    find: '1 = i valori della scheda tecnica. Usa 0,9 per tenere conto di sbrinamenti, invecchiamento o di un margine di sicurezza.',
  },
  coolCapA35: {
    what: 'Potenza frigorifera di una pompa di calore con 35 °C all’esterno e acqua refrigerata a 7 °C (A35/W7).',
    find: 'Tabella di raffrescamento della scheda tecnica, a “A35/W7”. Se raffreschi con pavimento o soffitto radiante (acqua a ~18 °C), usa invece il valore A35/W18, che è più alto.',
  },
  eerA35: {
    what: 'EER (raffrescamento prodotto ÷ elettricità consumata) ad A35/W7. Più alto è meglio.',
    find: 'Stessa tabella di raffrescamento della scheda tecnica (EN 14511). Usa A35/W18 se raffreschi con il pavimento radiante.',
  },
  coolCapLossPerK: {
    what: 'Di quanto cala la potenza frigorifera per ogni °C oltre i 35 °C esterni (0,01 = 1 % per °C).',
    find: 'Se la scheda tecnica riporta A40 o A43: (1 − potenza ad A40 ÷ potenza ad A35) ÷ 5. Altrimenti lascia 0,01.',
  },
  eerLossPerK: {
    what: 'Di quanto cala l’EER per ogni °C oltre i 35 °C esterni (0,02 = 2 % per °C).',
    find: 'Stesso metodo della perdita di potenza, usando le colonne EER. Altrimenti lascia 0,02.',
  },
  fanCoilCapKw: {
    what: 'Il massimo raffrescamento che i terminali interni possono cedere agli ambienti, qualunque cosa possa produrre la pompa di calore. Il modello non raffresca mai oltre questo valore.',
    find: 'Somma la potenza frigorifera totale nominale di tutti i ventilconvettori alla tua temperatura dell’acqua (es. 7/12 °C), dalle loro schede tecniche. Per pavimento o soffitto radiante usa circa 20–40 W per m² di superficie raffrescata.',
  },
  coolCapFactor: {
    what: 'Aumenta o riduce il raffrescamento erogabile per vedere cosa succede con meno potenza.',
    find: '1 = come da specifiche. Usa 0,8 per vedere l’effetto di un raffrescamento inferiore del 20 %.',
  },

  // ---------------------------------------------------------------- cooling loads
  coolingThreshold: {
    what: 'Il raffrescamento si accende quando la temperatura esterna media diurna o notturna supera questo valore, e mantiene la casa a questa temperatura. Tra la temperatura di riscaldamento e questo valore l’impianto è spento.',
    find: 'L’impostazione estiva del termostato; 24–26 °C è comune.',
  },
  hotDayThreshold: {
    what: 'Solo per le statistiche: un giorno “molto caldo” ha almeno un’ora pari o superiore a questa temperatura.',
    find: 'Scegli una temperatura che per te conta, es. 30 °C o la temperatura estiva di progetto della tua zona.',
  },
  coolTransmissionKwK: {
    what: 'Calore che entra da pareti, tetto e finestre per ogni °C in cui fuori fa più caldo che dentro (kW per kelvin).',
    find: 'Il coefficiente di trasmissione H_T (W/K) della relazione energetica, ÷ 1000. Oppure stimalo: dispersioni per trasmissione di progetto in W ÷ (temperatura interna − di progetto) ÷ 1000; es. 7.800 ÷ 32 ÷ 1000 ≈ 0,24.',
  },
  coolVentilationKwK: {
    what: 'Calore portato dall’aria esterna per ogni °C in cui fuori fa più caldo (kW per kelvin).',
    find: 'H_V (W/K) dalla relazione energetica, ÷ 1000. Oppure stimalo: 0,34 × ricambi d’aria all’ora × volume in m³ ÷ 1000, oppure dispersioni per ventilazione di progetto ÷ (temperatura interna − di progetto) ÷ 1000.',
  },
  internalGainsKw: {
    what: 'Calore medio prodotto all’interno da persone, elettrodomestici e luci.',
    find: 'Di solito 2–5 W per m² di superficie, quindi circa 0,3–0,8 kW per una casa familiare.',
  },
  windowSolarFactor: {
    what: 'Aumenta o riduce il sole che entra dalle finestre.',
    find: '1 = le superfici solari come inserite. Prova 1,5 per più sole del previsto (es. tapparelle lasciate aperte) o 0,5 per una buona schermatura esterna.',
  },
  opaqueSolarFactor: {
    what: 'Aumenta o riduce il calore che il sole trasmette a pareti e tetto.',
    find: '1 = come inserito. Aumentalo per tetti scuri e poco isolati.',
  },
  airflowM3h: {
    what: 'Aria esterna che entra in casa ogni ora (ventilazione più spifferi). Serve a calcolare quanta umidità va rimossa d’estate.',
    find: 'L’impostazione della tua unità di ventilazione, oppure circa 0,3–0,5 × il volume della casa in m³ con ventilazione naturale.',
  },
  indoorRH: {
    what: 'L’umidità relativa interna che vuoi d’estate, come frazione (0,5 = 50 %). Aria esterna più umida di così aggiunge un carico di deumidificazione.',
    find: '0,5 è tipico per il comfort. Aumentalo se non ti dà fastidio un po’ di afa in più.',
  },
  dehumidFactor: {
    what: 'Aumenta o riduce l’energia spesa per togliere l’umidità all’aria in ingresso.',
    find: '1 = ventilconvettori che deumidificano. Usa 0 per pavimento o soffitto radiante, che lavora sopra il punto di rugiada e non deumidifica.',
  },

  // ---------------------------------------------------------------- night comfort
  comfortEnabled: {
    what: 'Aggiunge un raffrescamento notturno extra per una parte della casa (di solito le camere) a una temperatura più bassa, come costo separato.',
    find: 'Attivalo se di notte raffreschi le camere sotto la normale temperatura di raffrescamento.',
  },
  comfortTargetTemp: {
    what: 'La temperatura notturna che vuoi in quelle stanze.',
    find: 'L’impostazione notturna del termostato in camera, es. 22–23 °C.',
  },
  comfortAreaM2: {
    what: 'Superficie delle stanze raffrescate alla temperatura notturna.',
    find: 'Somma le superfici delle camere dalla planimetria.',
  },
  totalFloorAreaM2: {
    what: 'Superficie riscaldata totale. Il carico di comfort notturno è la quota di questa superficie sul carico di raffrescamento dell’intera casa.',
    find: 'Dalla planimetria, dall’APE o dall’annuncio dell’immobile (superficie utile riscaldata).',
  },

  // ---------------------------------------------------------------- solar areas (table columns)
  winArea: {
    what: 'Superficie finestrata efficace per il sole in ogni direzione: a quanti m² di superficie “completamente aperta” al sole equivalgono le finestre.',
    find: 'Superficie vetrata × fattore g × fattore di ombreggiamento. Il fattore g è nella scheda del serramento (≈ 0,5–0,6 per doppio o triplo vetro). Fattore di ombreggiamento: 1 senza ombra, ~0,5 con aggetti, ~0,2–0,3 con schermature esterne chiuse. Es. 6 m² di vetro a sud × 0,55 × 0,85 ≈ 2,8.',
  },
  opqArea: {
    what: 'Superficie efficace per il sole che scalda pareti e tetto in ogni direzione. È piccola, perché l’isolamento fa passare poco di quel calore.',
    find: 'Superficie × trasmittanza U × assorbimento solare (≈ 0,6, di più per superfici scure) × 0,04. Es. 60 m² di parete × 0,25 × 0,6 × 0,04 ≈ 0,36. La relazione energetica può riportarla come area solare equivalente.',
  },
  roofArea: {
    what: 'Superficie efficace di captazione solare del tetto o dei lucernari (superfici orizzontali).',
    find: 'Lucernari: superficie vetrata × fattore g × ombreggiamento. Tetto: superficie × U × assorbimento × 0,04, con lo stesso metodo delle pareti.',
  },
  irLoss: {
    what: 'Calore che la casa irradia verso il cielo freddo (kW). Riduce leggermente il carico di raffrescamento.',
    find: 'Di solito 0–0,5 kW per una casa. Se non lo conosci, lascialo così.',
  },

  // ---------------------------------------------------------------- prices
  band: {
    what: 'Eurostat pubblica i prezzi per le famiglie per fascia di consumo annuo. Chi consuma di più paga meno per kWh.',
    find: 'Scegli la fascia che corrisponde al consumo annuo di tutta la casa, pompa di calore inclusa (lo trovi in bolletta). Le case con pompa di calore stanno di solito tra 5.000–14.999 kWh o ≥15.000 kWh.',
  },
  fallbackTariff: {
    what: 'Il tuo prezzo attuale per kWh, tutto incluso. Si usa per i semestri senza ancora un prezzo Eurostat, o per tutti i semestri se il tuo paese non ha dati Eurostat. Vuoto = l’ultimo prezzo Eurostat.',
    find: 'Dalla bolletta: totale di tutte le voci per kWh (energia + trasporto e gestione del contatore + oneri di sistema e imposte) ÷ kWh consumati. Escludi le quote fisse mensili. Con una tariffa variabile o a prezzo orario, usa la media.',
  },
  priceOverrides: {
    what: 'Sostituisci il prezzo di un singolo semestre, es. con quello che hai pagato davvero.',
    find: 'Dalle bollette di quel semestre: voci per kWh ÷ kWh. Lascia vuoto per usare Eurostat.',
  },
};
