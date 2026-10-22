/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("f301nblihxc1v8a")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "vdwbzt4w",
    "name": "cover_id",
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
  const collection = dao.findCollectionByNameOrId("f301nblihxc1v8a")

  // remove
  collection.schema.removeField("vdwbzt4w")

  return dao.saveCollection(collection)
})
