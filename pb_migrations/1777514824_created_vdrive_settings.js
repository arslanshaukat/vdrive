/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "msiqsl7wamrixlg",
    "created": "2026-04-30 02:07:04.913Z",
    "updated": "2026-04-30 02:07:04.913Z",
    "name": "vdrive_settings",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "buxdvr9w",
        "name": "key",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "1dtuyfur",
        "name": "value",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX `idx_vdrive_settings_key` ON `vdrive_settings` (`key`)"
    ],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("msiqsl7wamrixlg");

  return dao.deleteCollection(collection);
})
