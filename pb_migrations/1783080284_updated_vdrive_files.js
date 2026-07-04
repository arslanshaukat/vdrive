/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("7ksu0zly2ir31wf")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "zdfturd0",
    "name": "order",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("7ksu0zly2ir31wf")

  // remove
  collection.schema.removeField("zdfturd0")

  return dao.saveCollection(collection)
})
