const OrderedUUID = require('ordered-uuid');

/**
 * A function that can be used as a plugin for bookshelf
 * @param {Object} bookshelf The main bookshelf instance
 */
module.exports = (bookshelf) => {
    const modelPrototype = bookshelf.Model.prototype;

    // "Static" methods
    bookshelf.Model.generateUuid = function (orderedUuidPrefix) {
        return (orderedUuidPrefix || '') + OrderedUUID.generate();
    };

    bookshelf.Model.prefixedUuidToBinary = function (uuid, orderedUuidPrefixLength) {
        if (orderedUuidPrefixLength) {
            const prefix = uuid.substring(0, orderedUuidPrefixLength || 2);
            const uid = uuid.substring(orderedUuidPrefixLength || 2);
            return Buffer.concat([new Buffer(prefix.toString('binary'), 'binary'), new Buffer(uid, 'hex')]);
        }
        return new Buffer(uuid, 'hex');
    };

    bookshelf.Model.binaryToPrefixedUuid = function (buff, orderedUuidPrefixLength) {
        if (orderedUuidPrefixLength) {
            const prefix = buff.slice(0, orderedUuidPrefixLength || 2);
            const uid = buff.slice(orderedUuidPrefixLength || 2);
            return prefix.toString() + uid.toString('hex');
        }
        return buff.toString('hex');
    };

    // Extends the default model class
    bookshelf.Model = bookshelf.Model.extend({
        initialize: function () {
            modelPrototype.initialize.call(this);

            if (this.orderedUuids && Array.isArray(this.orderedUuids)) {
                this.on('saving', this.writeDefaults);
                this.on('fetching', this.writeDefaults);
                this.on('saved', this.readDefaults);
                this.on('fetched', this.readDefaults);
                this.on('fetched:collection', this.readCollectionDefaults);
            }
        },

        writeDefaults: function (model, columns, options) {
            this.orderedUuids.forEach((column) => {
                if (!this.attributes[column]) this.set(column, bookshelf.Model.generateUuid(this.orderedUuidPrefix));
                if (this.attributes[column]) this.set(column, bookshelf.Model.prefixedUuidToBinary(this.attributes[column], (this.orderedUuidPrefix ? this.orderedUuidPrefix.length : null)));
            });
            // hackey work-around
            if (this.orderedUuidPrefix
                && options.query
                && options.query._statements
                && options.query._statements.length) {
                options.query._statements = options.query._statements.map(function (stmt) {
                    this.orderedUuids.forEach((column) => {
                        if (stmt.column === `${this.tableName}.${column}` && stmt.value) {
                            stmt.value = bookshelf.Model.prefixedUuidToBinary(stmt.value,
                                (this.orderedUuidPrefix ? this.orderedUuidPrefix.length : null));
                        }
                    });
                    return stmt;
                }, this);
            }
            return this;
        },

        readDefaults: function () {
            this.orderedUuids.forEach((column) => {
                if (this.attributes[column]) this.set(column, bookshelf.Model.binaryToPrefixedUuid(this.attributes[column], (this.orderedUuidPrefix ? this.orderedUuidPrefix.length : null)));
            });
        },

        readCollectionDefaults: function (collection) {
            collection.each(function (model) {
                model.readDefaults();
            });
        },
    });
};
