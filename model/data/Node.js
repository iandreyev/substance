'use strict';

var isBoolean = require('lodash/isBoolean');
var isNumber = require('lodash/isNumber');
var isString = require('lodash/isString');
var isArray = require('lodash/isArray');
var isObject = require('lodash/isObject');
var cloneDeep = require('lodash/cloneDeep');
var each = require('lodash/each');
var extend = require('lodash/extend');
var EventEmitter = require('../../util/EventEmitter');

/**
  Base node implementation.

  @private
  @class Node
  @node
  @extends EventEmitter
  @param {Object} properties

  @prop {String} id an id that is unique within this data
 */
function Node(props) {
  EventEmitter.call(this);

  var NodeClass = this.constructor;

  var schema = NodeClass.schema;
  for (var name in schema) {
    if (!schema.hasOwnProperty(name)) continue;
    var prop = schema[name];
    // check integrity of provided props, such as type correctness,
    // and mandatory properties
    var propIsGiven = (props[name] !== undefined);
    var hasDefault = prop.hasOwnProperty('default');
    var isOptional = prop.optional;
    if ( (!isOptional && !hasDefault) && !propIsGiven) {
      throw new Error('Property ' + name + ' is mandatory for node type ' + this.type);
    }
    if (propIsGiven) {
      this[name] = _checked(prop, props[name]);
    } else if (hasDefault) {
      this[name] = cloneDeep(_checked(prop, prop.default));
    } else {
      // property is optional
    }
  }
}

Node.Prototype = function() {

  this._isNode = true;


  this.dispose = function() {};

  /**
    Check if the node is of a given type.

    @param {String} typeName
    @returns {Boolean} true if the node has a parent with given type, false otherwise.
  */
  this.isInstanceOf = function(typeName) {
    return Node.isInstanceOf(this.constructor, typeName);
  };

  /**
    Get a the list of all polymorphic types.

    @returns {String[]} An array of type names.
   */
  this.getTypeNames = function() {
    var typeNames = [];
    var NodeClass = this.constructor;
    while (NodeClass.type !== "node") {
      typeNames.push(NodeClass.type);
      NodeClass = Object.getPrototypeOf(NodeClass);
    }
    return typeNames;
  };

  /**
   * Get the type of a property.
   *
   * @param {String} propertyName
   * @returns The property's type.
   */
  this.getPropertyType = function(propertyName) {
    var schema = this.constructor.schema;
    return schema[propertyName].type;
  };

  /**
    Convert node to JSON.

    @returns {Object} JSON representation of node.
   */
  this.toJSON = function() {
    var data = {
      type: this.type
    };
    each(this.constructor.schema, function(prop, name) {
      data[prop.name] = this[name];
    }.bind(this));
    return data;
  };

};

EventEmitter.extend(Node);

Node.define = Node.defineSchema = function(schema) {
  _defineSchema(this, schema);
};

Node.define({
  type: "node",
  id: 'string'
});

Object.defineProperty(Node.prototype, 'type', {
  configurable: false,
  get: function() {
    return this.constructor.type;
  },
  set: function() {
    throw new Error('read-only');
  }
});

/**
  Internal implementation of Node.prototype.isInstanceOf.

  @static
  @private
  @returns {Boolean}
 */
Node.isInstanceOf = function(NodeClass, typeName) {
  var type = NodeClass.type;
  while (type !== "node") {
    if (type === typeName) return true;
    if (NodeClass.super) {
      NodeClass = NodeClass.super;
      type = NodeClass.type;
    } else {
      break;
    }
  }
  return false;
};

// ### Internal implementation

function _defineSchema(NodeClass, schema) {
  if (schema.type) {
    NodeClass.type = schema.type;
  }
  var compiledSchema = _compileSchema(schema);
  // collects a full schema considering the schemas of parent class
  // we will use the unfolded schema, check integrity of the given props (mandatory, readonly)
  // or fill in default values for undefined properties.
  NodeClass.schema = _unfoldedSchema(NodeClass, compiledSchema);
  // computes the set of default properties only once
  NodeClass.defaultProps = _extractDefaultProps(NodeClass);
}

function _compileSchema(schema) {
  var compiledSchema = {};
  each(schema, function(definition, name) {
    // skip 'type'
    if (name === 'type') {
      return;
    }
    if (isString(definition) || isArray(definition)) {
      definition = { type: definition };
    }
    definition = _compileDefintion(definition);
    definition.name = name;
    compiledSchema[name] = definition;
  });
  return compiledSchema;
}

function _compileDefintion(definition) {
  var result = definition;
  if (isArray(definition.type) && definition[0] !== "array") {
    definition.type = [ "array", definition.type[0] ];
  } else if (definition.type === 'text') {
    result = {
      type: "string",
      default: ''
    };
  }
  return result;
}

function _unfoldedSchema(NodeClass, compiledSchema) {
  var schemas = [compiledSchema];
  var clazz = NodeClass;
  while(clazz) {
    var parentProto = Object.getPrototypeOf(clazz.prototype);
    if (!parentProto) {
      break;
    }
    clazz = parentProto.constructor;
    if (clazz && clazz.schema) {
      schemas.unshift(clazz.schema);
    }
  }
  schemas.unshift({});
  return extend.apply(null, schemas);
}

function _extractDefaultProps(NodeClass) {
  var unfoldedSchema = NodeClass.unfoldedSchema;
  var defaultProps = {};
  each(unfoldedSchema, function(prop, name) {
    if (prop.hasOwnProperty('default')) {
      defaultProps[name] = prop['default'];
    }
  });
  return defaultProps;
}

function _checked(prop, value) {
  var type;
  if (isArray(prop.type)) {
    type = "array";
  } else {
    type = prop.type;
  }
  if (value === null) {
    if (prop.notNull) {
      throw new Error('Value for property ' + prop.name + ' is null.');
    } else {
      return value;
    }
  }
  if (value === undefined) {
    throw new Error('Value for property ' + prop.name + ' is undefined.');
  }
  if (type === "string" && !isString(value) ||
      type === "boolean" && !isBoolean(value) ||
      type === "number" && !isNumber(value) ||
      type === "array" && !isArray(value) ||
      type === "id" && !isString(value) ||
      type === "object" && !isObject(value)) {
    throw new Error('Illegal value type for property ' + prop.name + ': expected ' + type + ', was ' + (typeof value));
  }
  return value;
}

module.exports = Node;
