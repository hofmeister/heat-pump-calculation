/**
 * Ayuda en lenguaje sencillo para cada dato: qué significa y dónde encontrar el número.
 * Debe tener exactamente las mismas claves que help.en.ts.
 */
import type { Help } from './help.en';

export const help: Help = {
  // ---------------------------------------------------------------- ubicación y periodo
  location: {
    what: 'Dónde está el edificio. Para estas coordenadas se descargan datos horarios de clima y radiación solar.',
    find: 'Pulsa «Usar mi ubicación» (el navegador pide permiso primero) o busca tu localidad o dirección. También puedes copiar las coordenadas de un mapa (en Google Maps, clic derecho en la casa y clic en los números).',
  },
  countryCode: {
    what: 'Código de país de dos letras (p. ej. ES, DE, IT) con el que se consultan en Eurostat los precios de la luz para hogares.',
    find: 'Se rellena solo al elegir un resultado de la búsqueda. Eurostat cubre los países de la UE/EEE y algunos vecinos; en otros sitios, introduce tu propia tarifa en Precios de la electricidad.',
  },
  period: {
    what: 'Los días que se simulan. Los periodos largos compensan inviernos y veranos atípicos.',
    find: 'Cinco años completos o más dan una imagen fiable. Deja “Hasta” en blanco para calcular siempre hasta ayer.',
  },

  // ---------------------------------------------------------------- edificio – calefacción
  heatingIndoorTemp: {
    what: 'La temperatura que mantienes dentro de casa en invierno.',
    find: 'La consigna de tu termostato; lo habitual es 20–21 °C. Cada grado de más añade aproximadamente un 6 % a la energía de calefacción.',
  },
  designOutdoorTemp: {
    what: 'La temperatura exterior más fría para la que se dimensiona la calefacción (la “temperatura exterior de diseño”). Las pérdidas de calor de abajo se dan a esta temperatura.',
    find: 'Aparece en el cálculo de cargas térmicas o en el estudio energético (EN 12831). Si no, usa la tabla de la norma de tu país para tu localidad o pregunta a un instalador. Es más o menos la temperatura más baja que se alcanza unos pocos días al año, p. ej. de −12 a −16 °C en Centroeuropa.',
  },
  designTransmissionLossW: {
    what: 'Calor que se pierde a través de muros, cubierta, suelo y ventanas cuando fuera hace el frío de diseño.',
    find: 'Las “pérdidas por transmisión” totales (Φ_T) de un cálculo de cargas térmicas estancia por estancia hecho por un instalador o técnico energético. Si solo conoces la carga térmica total, usa el campo de sustitución.',
  },
  designVentilationLossW: {
    what: 'Calor que se pierde al calentar el aire exterior que entra por la ventilación y las infiltraciones, a la temperatura de diseño.',
    find: 'Las “pérdidas por ventilación” (Φ_V) del mismo estudio. Estimación aproximada: 0,34 × renovaciones de aire por hora × volumen de la casa en m³ × (temperatura interior − de diseño), en W. Una ventilación con recuperación de calor la reduce mucho.',
  },
  designHeatLoadOverrideKw: {
    what: 'La carga térmica de diseño total del edificio, si solo tienes un número. Déjalo en blanco para usar transmisión + ventilación.',
    find: 'De un cálculo de cargas térmicas o del dimensionado de la bomba de calor en un presupuesto del instalador (sin margen de reactivación). Estimación a partir del consumo pasado: energía de calefacción anual en kWh (m³ de gas × ~10 × rendimiento de la caldera ~0,9, o litros de gasóleo × ~10) ÷ 2000 horas equivalentes a plena carga. O superficie × W/m²: ~30–40 en obra nueva, ~50–70 reformada, más de 100 sin aislar.',
  },

  // ---------------------------------------------------------------- bombas de calor
  pumpCount: {
    what: 'Cuántas bombas de calor iguales calientan y enfrían la casa.',
    find: 'Cuenta las unidades exteriores que dan calefacción. No cuentes las que solo producen agua caliente sanitaria.',
  },
  heatCapMinus7: {
    what: 'Potencia calorífica de una bomba de calor con −7 °C en el exterior, a la temperatura de impulsión de tu instalación. Por debajo de −7 °C el modelo mantiene este valor.',
    find: 'En la ficha técnica o el manual de datos de la bomba de calor, en la tabla de potencias para “A-7/W35”, “A-7/W45” o “A-7/W55”. Elige el valor W más cercano a tu temperatura de impulsión (suelo radiante ≈ 35 °C, radiadores 45–55 °C). Usa la potencia máxima, no la nominal.',
  },
  heatCapPlus7: {
    what: 'Potencia calorífica de una bomba de calor con +7 °C en el exterior. Entre −7 y +7 °C el modelo traza una línea recta.',
    find: 'La misma tabla de la ficha técnica, en “A7/W35”, “A7/W45” o “A7/W55”. A7/W35 suele ser el valor destacado.',
  },
  copMinus7: {
    what: 'COP (calor producido ÷ electricidad consumida) con −7 °C en el exterior. Cuanto más alto, mejor.',
    find: 'La misma tabla de la ficha técnica que la potencia a −7 °C, con la misma temperatura de impulsión (puntos de ensayo EN 14511). En la práctica, el COP en invierno suele ser un 5–10 % menor por los desescarches.',
  },
  copPlus7: {
    what: 'COP con +7 °C en el exterior.',
    find: 'Ficha técnica, en A7 y tu temperatura de impulsión. Como referencia: un SCOP de 4 a 35 °C suele equivaler a un COP de unos 4,5–5 en A7/W35.',
  },
  heatCapFactor: {
    what: 'Sube o baja la potencia calorífica para probar qué pasa con menos capacidad.',
    find: '1 = los valores de la ficha técnica. Usa 0,9 para tener en cuenta desescarches, envejecimiento o un margen de seguridad.',
  },
  coolCapA35: {
    what: 'Potencia frigorífica de una bomba de calor con 35 °C en el exterior y agua fría a 7 °C (A35/W7).',
    find: 'Tabla de refrigeración de la ficha técnica, en “A35/W7”. Si refrescas con suelo o techo radiante (agua a ~18 °C), usa el valor A35/W18; es más alto.',
  },
  eerA35: {
    what: 'EER (frío producido ÷ electricidad consumida) en A35/W7. Cuanto más alto, mejor.',
    find: 'La misma tabla de refrigeración de la ficha técnica (EN 14511). Usa A35/W18 si refrescas con suelo radiante.',
  },
  coolCapLossPerK: {
    what: 'Cuánto baja la potencia frigorífica por cada °C por encima de 35 °C en el exterior (0,01 = 1 % por °C).',
    find: 'Si la ficha técnica da A40 o A43: (1 − potencia en A40 ÷ potencia en A35) ÷ 5. Si no, deja 0,01.',
  },
  eerLossPerK: {
    what: 'Cuánto baja el EER por cada °C por encima de 35 °C en el exterior (0,02 = 2 % por °C).',
    find: 'El mismo método que para la pérdida de potencia, con las columnas de EER. Si no, deja 0,02.',
  },
  fanCoilCapKw: {
    what: 'El máximo de frío que tus unidades interiores pueden entregar a las estancias, produzca lo que produzca la bomba de calor. El modelo nunca enfría más que esto.',
    find: 'Suma la potencia frigorífica total nominal de todos los fancoils a tu temperatura de agua (p. ej. 7/12 °C), según sus fichas técnicas. Para suelo o techo refrescante, usa unos 20–40 W por m² de superficie refrigerada.',
  },
  coolCapFactor: {
    what: 'Sube o baja la refrigeración que se puede entregar para probar qué pasa con menos capacidad.',
    find: '1 = según especificaciones. Usa 0,8 para ver el efecto de un 20 % menos de frío.',
  },

  // ---------------------------------------------------------------- cargas de refrigeración
  coolingThreshold: {
    what: 'La refrigeración se activa cuando la temperatura exterior media del día o de la noche supera este valor, y mantiene la casa a esta temperatura. Entre la consigna de calefacción y este valor el sistema está apagado.',
    find: 'La consigna de tu termostato en verano; lo habitual es 24–26 °C.',
  },
  hotDayThreshold: {
    what: 'Solo para las estadísticas: un día “muy caluroso” tiene al menos una hora a esta temperatura o más.',
    find: 'Elige una temperatura que te importe, p. ej. 30 °C o la temperatura de diseño de verano de tu zona.',
  },
  coolTransmissionKwK: {
    what: 'Calor que entra por muros, cubierta y ventanas por cada °C que hace más calor fuera que dentro (kW por kelvin).',
    find: 'El coeficiente de transmisión H_T (W/K) de un estudio energético, ÷ 1000. O estímalo: pérdidas por transmisión de diseño en W ÷ (temperatura interior − de diseño) ÷ 1000; p. ej. 7800 ÷ 32 ÷ 1000 ≈ 0,24.',
  },
  coolVentilationKwK: {
    what: 'Calor que aporta el aire exterior por cada °C que hace más calor fuera (kW por kelvin).',
    find: 'H_V (W/K) de un estudio energético, ÷ 1000. O estímalo: 0,34 × renovaciones de aire por hora × volumen en m³ ÷ 1000, o pérdidas por ventilación de diseño ÷ (temperatura interior − de diseño) ÷ 1000.',
  },
  internalGainsKw: {
    what: 'Calor medio que desprenden dentro las personas, los electrodomésticos y la iluminación.',
    find: 'Normalmente 2–5 W por m² de superficie, es decir, unos 0,3–0,8 kW en una vivienda familiar.',
  },
  windowSolarFactor: {
    what: 'Ajusta el sol que entra por las ventanas.',
    find: '1 = las superficies solares tal como las has introducido. Prueba 1,5 si entra más sol del previsto (p. ej. persianas subidas) o 0,5 con buena protección solar exterior.',
  },
  opaqueSolarFactor: {
    what: 'Ajusta el calor que el sol mete en muros y cubierta.',
    find: '1 = tal como lo has introducido. Súbelo para cubiertas oscuras y mal aisladas.',
  },
  airflowM3h: {
    what: 'Aire exterior que entra en la casa por hora (ventilación más infiltraciones). Sirve para calcular cuánta humedad hay que quitar en verano.',
    find: 'El caudal de tu equipo de ventilación, o unas 0,3–0,5 × el volumen de la casa en m³ con ventilación natural.',
  },
  indoorRH: {
    what: 'Humedad relativa interior que buscas en verano, como fracción (0,5 = 50 %). Si el aire exterior es más húmedo, se añade una carga de deshumidificación.',
    find: 'Lo habitual para estar cómodo es 0,5. Súbelo si no te importa un ambiente algo más bochornoso.',
  },
  dehumidFactor: {
    what: 'Ajusta la energía que se gasta en quitar humedad al aire que entra.',
    find: '1 = fancoils que deshumidifican. Usa 0 para suelo o techo refrescante, que trabaja por encima del punto de rocío y no deshumidifica.',
  },

  // ---------------------------------------------------------------- confort nocturno
  comfortEnabled: {
    what: 'Añade refrigeración nocturna extra en parte de la casa (normalmente los dormitorios) hasta una temperatura más baja, como coste aparte.',
    find: 'Actívalo si por la noche enfrías los dormitorios por debajo de la consigna normal de refrigeración.',
  },
  comfortTargetTemp: {
    what: 'La temperatura nocturna que quieres en esas estancias.',
    find: 'La consigna nocturna del termostato del dormitorio, p. ej. 22–23 °C.',
  },
  comfortAreaM2: {
    what: 'Superficie de las estancias que se enfrían a la temperatura nocturna.',
    find: 'Suma la superficie de los dormitorios según el plano.',
  },
  totalFloorAreaM2: {
    what: 'Superficie calefactada total. La carga de confort nocturno es la parte que corresponde a esta superficie de la carga de refrigeración de toda la casa.',
    find: 'Del plano, del certificado energético o del anuncio de la vivienda (superficie útil calefactada).',
  },

  // ---------------------------------------------------------------- superficies solares (columnas)
  winArea: {
    what: 'Superficie efectiva de ventanas al sol en cada orientación: a cuántos m² de superficie captadora “totalmente expuesta” equivalen las ventanas.',
    find: 'Superficie de vidrio × factor solar g × factor de sombra. El factor solar g figura en la ficha de la ventana (≈ 0,5–0,6 en doble o triple acristalamiento). Factor de sombra: 1 sin sombra, ~0,5 con voladizos, ~0,2–0,3 con persianas exteriores bajadas. P. ej. 6 m² de vidrio al sur × 0,55 × 0,85 ≈ 2,8.',
  },
  opqArea: {
    what: 'Superficie efectiva con la que el sol calienta muros y cubierta en cada orientación. Es pequeña, porque el aislamiento deja pasar poco de ese calor.',
    find: 'Superficie × transmitancia U × absortividad de la superficie (≈ 0,6, más en superficies oscuras) × 0,04. P. ej. 60 m² de muro × 0,25 × 0,6 × 0,04 ≈ 0,36. Tu estudio energético puede darla como superficie solar efectiva de captación.',
  },
  roofArea: {
    what: 'Superficie efectiva de captación solar de la cubierta o los lucernarios (superficies horizontales).',
    find: 'Lucernarios: superficie de vidrio × factor solar g × sombra. Cubierta: superficie × U × absortividad × 0,04, con el mismo método que los muros.',
  },
  irLoss: {
    what: 'Calor que la casa irradia hacia el cielo frío (kW). Reduce un poco la carga de refrigeración.',
    find: 'Normalmente 0–0,5 kW en una vivienda. Déjalo como está si no lo sabes.',
  },

  // ---------------------------------------------------------------- precios
  band: {
    what: 'Eurostat publica los precios para hogares por tramos de consumo anual. Quien más consume paga menos por kWh.',
    find: 'Elige el tramo que corresponda al consumo anual de todo tu hogar, incluida la bomba de calor (viene en la factura de la luz). Las casas con bomba de calor suelen estar en 5000–14 999 kWh o ≥ 15 000 kWh.',
  },
  fallbackTariff: {
    what: 'Tu precio actual por kWh, todo incluido. Se usa en los semestres que aún no tienen precio de Eurostat, o en todos si tu país no tiene datos en Eurostat. En blanco = el último precio de Eurostat.',
    find: 'De tu factura de la luz: suma de todos los conceptos por kWh (energía + peajes y cargos + impuestos) ÷ kWh consumidos. No incluyas los términos fijos (potencia, alquiler del contador). Con una tarifa dinámica o indexada, usa tu precio medio.',
  },
  priceOverrides: {
    what: 'Sustituye el precio de un semestre concreto, p. ej. por lo que pagaste de verdad.',
    find: 'De tus facturas de ese semestre: conceptos por kWh ÷ kWh. Déjalo en blanco para usar Eurostat.',
  },
};
