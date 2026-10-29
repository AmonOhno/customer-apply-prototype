import { DEFAULT_COLUMNS, DEFAULT_USERS, PAYMENT_TERMS } from './columns.ts';
import type { AppState, MasterRow } from './types.ts';

/** デモ用の架空データ。実在の企業とは関係ありません。 */
const COMPANIES: [string, string, string][] = [
  ['株式会社青葉精機', 'アオバセイキ', '宮城県仙台市青葉区一番町2-4-1'],
  ['北斗電子工業株式会社', 'ホクトデンシコウギョウ', '北海道札幌市中央区北二条西3-1'],
  ['株式会社みなと物流', 'ミナトブツリュウ', '神奈川県横浜市中区海岸通1-1'],
  ['東邦ケミカル株式会社', 'トウホウケミカル', '大阪府大阪市西区靱本町1-8-2'],
  ['有限会社さくら梱包', 'サクラコンポウ', '埼玉県川口市本町4-3-6'],
  ['株式会社千代田システムズ', 'チヨダシステムズ', '東京都千代田区神田錦町3-22'],
  ['中部プレス工業株式会社', 'チュウブプレスコウギョウ', '愛知県名古屋市中村区名駅4-5-28'],
  ['株式会社瀬戸内マリン', 'セトウチマリン', '広島県広島市南区宇品海岸1-12'],
  ['九州フーズ株式会社', 'キュウシュウフーズ', '福岡県福岡市博多区博多駅前2-19-17'],
  ['株式会社ひかり印刷', 'ヒカリインサツ', '京都府京都市下京区四条通烏丸東入'],
  ['日向ロジテック株式会社', 'ヒュウガロジテック', '宮崎県宮崎市橘通東3-1-11'],
  ['株式会社富士見建材', 'フジミケンザイ', '静岡県静岡市葵区紺屋町17-1'],
  ['北陸アルミ株式会社', 'ホクリクアルミ', '富山県富山市新桜町7-38'],
  ['株式会社ことり電機', 'コトリデンキ', '東京都品川区大崎1-11-2'],
  ['関東スチール株式会社', 'カントウスチール', '千葉県千葉市中央区中央港1-16'],
  ['株式会社いろは商事', 'イロハショウジ', '兵庫県神戸市中央区三宮町1-9-1'],
  ['東北ファーム株式会社', 'トウホクファーム', '岩手県盛岡市大通3-3-10'],
  ['株式会社ミライ計装', 'ミライケイソウ', '茨城県つくば市竹園1-6-1'],
  ['南海テキスタイル株式会社', 'ナンカイテキスタイル', '和歌山県和歌山市本町2-1'],
  ['株式会社やまびこ通信', 'ヤマビコツウシン', '長野県長野市南長野県町593'],
  ['大和ハーネス株式会社', 'ヤマトハーネス', '奈良県奈良市三条大路1-1-90'],
  ['株式会社琥珀フーズ', 'コハクフーズ', '石川県金沢市広坂1-1-1'],
  ['四国ペーパー株式会社', 'シコクペーパー', '愛媛県松山市一番町4-4-2'],
  ['株式会社オリオン工機', 'オリオンコウキ', '群馬県高崎市高松町35-1'],
];

const BANKS = ['みずほ銀行 本店', '三井住友銀行 東京営業部', '三菱UFJ銀行 本店', 'りそな銀行 東京営業部', 'ゆうちょ銀行 〇一八店'];

const pad = (n: number, w: number) => String(n).padStart(w, '0');

const DAY = 24 * 3600 * 1000;
const daysBefore = (at: string, days: number) => new Date(Date.parse(at) - days * DAY).toISOString();
/** 最終更新日時をばらつかせ、期間で絞り込むクエリを試せるようにする（直近1ヶ月：8件、1年以上前：4件） */
const updatedDaysAgo = (i: number) => [2, 9, 15, 26][i % 4] + [0, 0, 90, 200, 420, 60][i % 6];

export function seedRows(at: string): MasterRow[] {
  return COMPANIES.map(([name, kana, address], i) => {
    const n = i + 1;
    const isSupplier = i % 3 !== 1;
    const category = i % 5 === 0 ? '仕入先・得意先' : isSupplier ? '仕入先' : '得意先';
    const corp = `${(n * 7919) % 9 + 1}${pad((n * 104729) % 1_000_000_000_000, 12)}`;
    const updated = updatedDaysAgo(i);
    return {
      id: `r-${pad(n, 3)}`,
      createdAt: daysBefore(at, updated + 365),
      updatedAt: daysBefore(at, updated),
      values: {
        code: `${isSupplier ? 'V' : 'C'}${pad(n * 10 + 1, 5)}`,
        name,
        kana,
        category,
        corpNo: corp,
        invoiceNo: i % 6 === 4 ? null : `T${corp}`,
        zip: `${pad(100 + ((n * 37) % 800), 3)}-${pad((n * 4421) % 10000, 4)}`,
        address,
        tel: `0${(n % 9) + 1}-${pad((n * 3301) % 10000, 4)}-${pad((n * 7177) % 10000, 4)}`,
        paymentTerms: PAYMENT_TERMS[i % 3],
        bank: `${BANKS[i % BANKS.length]} 普通 ${pad((n * 918273) % 10_000_000, 7)}`,
        creditLimit: ((n * 37) % 20 + 1) * 500_000,
        status: i === 9 || i === 17 ? '取引停止' : '取引中',
        note: i === 2 ? '2027年4月に本社移転予定' : null,
      },
    };
  });
}

export function createInitialState(at: string = new Date().toISOString()): AppState {
  return {
    schema: 1,
    users: DEFAULT_USERS,
    currentUserId: DEFAULT_USERS[0].id,
    columns: DEFAULT_COLUMNS,
    rows: seedRows(at),
    drafts: {},
    changeSets: [],
    history: [],
    seq: 1,
  };
}
