// AIVIC Backend Configuration
// AIVIC_APP_URL 環境変数が設定されている場合は自動セットされます
// 未設定の場合: REPLACE_WITH_API_URL を AIVIC アプリの URL（例: https://your-app.amplifyapp.com）に書き換えてください

window.AIVIC_API_URL = "REPLACE_WITH_API_URL";
window.AIVIC_TABLES = {
  "受注案件": 0,
  "案件ステータスマスタ": 1,
  "優先度マスタ": 2,
  "入荷予定": 3,
  "商品": 4,
  "案件商品紐付け": 5,
  "納期回答期限管理": 6,
  "見積提出履歴": 7,
  "手配期限管理": 8,
  "仕入先納期遅延報告": 9,
  "顧客通知履歴": 10,
  "ユーザー": 11,
  "ユーザー権限": 12,
  "操作ログ": 13
};
