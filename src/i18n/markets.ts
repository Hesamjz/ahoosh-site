// Markets page strings — all four locales.
import type { Locale } from './ui';

const SOURCES_EN =
  'Data sources: European Central Bank (via Frankfurter API) · <a href="https://tgju.org" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">TGJU</a> (Iranian Rial market rates) · ExchangeRate-API (RSD) · Yahoo Finance (commodities) · CoinGecko (crypto). IRR rates are free-market rates in rials, refreshed ~5 min.';

export const MARKETS_STRINGS: Record<Locale, any> = {
  en: {
    title: 'Markets',
    description:
      'AHoosh tracks selected market signals, prices, and public data to support better business and investment decisions. FX, gold, crypto, and commodities.',
    eyebrow: 'Market Data',
    h1: 'Selected Market Signals &amp; Prices',
    subtitle: 'FX · Gold · Crypto · Commodities · Informational data, not financial advice',
    fxHeading: 'Foreign Exchange',
    commoditiesHeading: 'Commodities',
    cryptoHeading: 'Crypto — Top 10',
    bridgeTitle: 'Need help interpreting this data?',
    bridgeText:
      'AHoosh can help you turn market signals into a practical research report, strategy assessment, or decision framework for your specific situation.',
    bridgeCta: 'Request Consulting',
    disclaimerLabel: 'Disclaimer:',
    disclaimerText:
      'This data is for informational purposes only and is not financial advice. Data may be delayed or incomplete. Verify all figures independently before making financial or business decisions. AHoosh is not a broker, trading platform, or investment service.',
    sourcesHtml: SOURCES_EN,
    updatedLabel: 'Updated',
    names: {},
  },
  fa: {
    title: 'بازارها',
    description:
      'آهوش سیگنال‌های منتخب بازار، قیمت‌ها و داده‌های عمومی را برای تصمیم‌های بهتر کسب‌وکار و سرمایه‌گذاری دنبال می‌کند. ارز، طلا، رمزارز و کالاها.',
    eyebrow: 'داده‌های بازار',
    h1: 'سیگنال‌ها و قیمت‌های منتخب بازار',
    subtitle: 'ارز · طلا · رمزارز · کالاها · صرفاً اطلاع‌رسانی، توصیه مالی نیست',
    fxHeading: 'ارزها',
    commoditiesHeading: 'کالاها',
    cryptoHeading: 'رمزارز — ۱۰ مورد برتر',
    bridgeTitle: 'برای تفسیر این داده‌ها کمک می‌خواهید؟',
    bridgeText:
      'آهوش می‌تواند سیگنال‌های بازار را برای موقعیت مشخص شما به گزارش پژوهشی کاربردی، ارزیابی استراتژی یا چارچوب تصمیم‌گیری تبدیل کند.',
    bridgeCta: 'درخواست مشاوره',
    disclaimerLabel: 'سلب مسئولیت:',
    disclaimerText:
      'این داده‌ها صرفاً جنبه اطلاع‌رسانی دارند و توصیه مالی نیستند. ممکن است داده‌ها با تأخیر یا ناقص باشند. پیش از هر تصمیم مالی یا تجاری، ارقام را مستقل بررسی کنید. آهوش کارگزار، پلتفرم معاملاتی یا خدمات سرمایه‌گذاری نیست.',
    sourcesHtml:
      'منابع داده: بانک مرکزی اروپا (Frankfurter) · <a href="https://tgju.org" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">TGJU</a> (نرخ بازار آزاد ریال) · ExchangeRate-API (دینار صربستان) · Yahoo Finance (کالاها) · CoinGecko (رمزارز). نرخ‌های ریال، نرخ بازار آزاد و به ریال هستند و حدوداً هر ۵ دقیقه به‌روز می‌شوند.',
    updatedLabel: 'به‌روزرسانی',
    names: {
      'EUR/USD': 'یورو / دلار آمریکا',
      'EUR/GBP': 'یورو / پوند انگلیس',
      'EUR/CHF': 'یورو / فرانک سوئیس',
      'EUR/RSD': 'یورو / دینار صربستان',
      'EUR/TRY': 'یورو / لیر ترکیه',
      'USD/IRR': 'دلار آمریکا / ریال ایران (بازار آزاد)',
      'EUR/IRR': 'یورو / ریال ایران (بازار آزاد)',
      'XAU/USD': 'طلا (اونس)',
      'XAG/USD': 'نقره (اونس)',
      'BRENT': 'نفت برنت',
      'WTI': 'نفت WTI',
    },
  },
  de: {
    title: 'Märkte',
    description:
      'AHoosh verfolgt ausgewählte Marktsignale, Preise und öffentliche Daten für bessere Geschäfts- und Investitionsentscheidungen. Devisen, Gold, Krypto und Rohstoffe.',
    eyebrow: 'Marktdaten',
    h1: 'Ausgewählte Marktsignale &amp; Preise',
    subtitle: 'Devisen · Gold · Krypto · Rohstoffe · Nur zur Information, keine Finanzberatung',
    fxHeading: 'Devisen',
    commoditiesHeading: 'Rohstoffe',
    cryptoHeading: 'Krypto — Top 10',
    bridgeTitle: 'Brauchen Sie Hilfe bei der Interpretation dieser Daten?',
    bridgeText:
      'AHoosh übersetzt Marktsignale in einen praxisnahen Research-Report, eine Strategiebewertung oder ein Entscheidungsmodell für Ihre konkrete Situation.',
    bridgeCta: 'Beratung anfragen',
    disclaimerLabel: 'Hinweis:',
    disclaimerText:
      'Diese Daten dienen nur der Information und stellen keine Finanzberatung dar. Daten können verzögert oder unvollständig sein. Prüfen Sie alle Zahlen unabhängig, bevor Sie finanzielle oder geschäftliche Entscheidungen treffen. AHoosh ist kein Broker, keine Handelsplattform und kein Investmentservice.',
    sourcesHtml:
      'Datenquellen: Europäische Zentralbank (Frankfurter API) · <a href="https://tgju.org" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">TGJU</a> (Marktkurse Iranischer Rial) · ExchangeRate-API (RSD) · Yahoo Finance (Rohstoffe) · CoinGecko (Krypto). IRR-Kurse sind freie Marktkurse in Rial, Aktualisierung ca. alle 5 Min.',
    updatedLabel: 'Aktualisiert',
    names: {
      'EUR/USD': 'Euro / US-Dollar',
      'EUR/GBP': 'Euro / Britisches Pfund',
      'EUR/CHF': 'Euro / Schweizer Franken',
      'EUR/RSD': 'Euro / Serbischer Dinar',
      'EUR/TRY': 'Euro / Türkische Lira',
      'USD/IRR': 'US-Dollar / Iranischer Rial (Markt)',
      'EUR/IRR': 'Euro / Iranischer Rial (Markt)',
      'XAU/USD': 'Gold (Unze)',
      'XAG/USD': 'Silber (Unze)',
      'BRENT': 'Brent-Rohöl',
      'WTI': 'WTI-Rohöl',
    },
  },
  sr: {
    title: 'Tržišta',
    description:
      'AHoosh prati odabrane tržišne signale, cene i javne podatke za bolje poslovne i investicione odluke. Devize, zlato, kripto i robe.',
    eyebrow: 'Tržišni podaci',
    h1: 'Odabrani tržišni signali i cene',
    subtitle: 'Devize · Zlato · Kripto · Robe · Samo informativno, nije finansijski savet',
    fxHeading: 'Devize',
    commoditiesHeading: 'Robe',
    cryptoHeading: 'Kripto — Top 10',
    bridgeTitle: 'Treba vam pomoć u tumačenju ovih podataka?',
    bridgeText:
      'AHoosh može da pretvori tržišne signale u praktičan istraživački izveštaj, procenu strategije ili okvir za odlučivanje za vašu konkretnu situaciju.',
    bridgeCta: 'Zatraži konsalting',
    disclaimerLabel: 'Napomena:',
    disclaimerText:
      'Ovi podaci služe samo u informativne svrhe i nisu finansijski savet. Podaci mogu kasniti ili biti nepotpuni. Proverite sve brojke nezavisno pre donošenja finansijskih ili poslovnih odluka. AHoosh nije broker, platforma za trgovanje niti investicioni servis.',
    sourcesHtml:
      'Izvori podataka: Evropska centralna banka (Frankfurter API) · <a href="https://tgju.org" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">TGJU</a> (tržišni kurs iranskog rijala) · ExchangeRate-API (RSD) · Yahoo Finance (robe) · CoinGecko (kripto). IRR kursevi su slobodni tržišni kursevi u rijalima, osvežavanje ~5 min.',
    updatedLabel: 'Ažurirano',
    names: {
      'EUR/USD': 'Evro / Američki dolar',
      'EUR/GBP': 'Evro / Britanska funta',
      'EUR/CHF': 'Evro / Švajcarski franak',
      'EUR/RSD': 'Evro / Srpski dinar',
      'EUR/TRY': 'Evro / Turska lira',
      'USD/IRR': 'Američki dolar / Iranski rijal (tržišni)',
      'EUR/IRR': 'Evro / Iranski rijal (tržišni)',
      'XAU/USD': 'Zlato (unca)',
      'XAG/USD': 'Srebro (unca)',
      'BRENT': 'Brent nafta',
      'WTI': 'WTI nafta',
    },
  },
};
