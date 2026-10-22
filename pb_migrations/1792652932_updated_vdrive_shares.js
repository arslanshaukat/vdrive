/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("h3xg7kwmarwjjxv")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "5jb7ceu4",
    "name": "password_hash",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("h3xg7kwmarwjjxv")

  // remove
  collection.schema.removeField("5jb7ceu4")

  return dao.saveCollection(collection)
})
