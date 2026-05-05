/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "f301nblihxc1v8a",
    "created": "2026-04-29 15:01:44.702Z",
    "updated": "2026-04-29 15:01:44.702Z",
    "name": "vdrive_folders",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "l8hpneq6",
        "name": "name",
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
        "id": "7vqezpwf",
        "name": "parent_id",
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
      "CREATE INDEX `idx_vdrive_folders_parent` ON `vdrive_folders` (`parent_id`)"
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
  const collection = dao.findCollectionByNameOrId("f301nblihxc1v8a");

  return dao.deleteCollection(collection);
})
