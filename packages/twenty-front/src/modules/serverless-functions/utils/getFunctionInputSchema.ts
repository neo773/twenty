import {
  type InputSchema,
  type InputSchemaProperty,
} from '@/workflow/types/InputSchema';
import { type TSESTree } from '@typescript-eslint/types';
import { parse } from '@typescript-eslint/typescript-estree';
import { isDefined } from 'twenty-shared/utils';

const getTypeString = (typeNode?: TSESTree.TypeNode): InputSchemaProperty => {
  if (!typeNode) return { type: 'unknown' };

  switch (typeNode.type) {
    case 'TSNumberKeyword':
      return { type: 'number' };
    case 'TSStringKeyword':
      return { type: 'string' };
    case 'TSBooleanKeyword':
      return { type: 'boolean' };
    case 'TSArrayType':
      return {
        type: 'array',
        items: getTypeString(typeNode.elementType),
      };
    case 'TSObjectKeyword':
      return { type: 'object' };
    case 'TSTypeLiteral': {
      const properties: InputSchemaProperty['properties'] = {};
      typeNode.members.forEach((member) => {
        if (
          member.type === 'TSPropertySignature' &&
          member.key.type === 'Identifier'
        ) {
          properties[member.key.name] = getTypeString(
            member.typeAnnotation?.typeAnnotation,
          );
        }
      });
      return { type: 'object', properties };
    }
    case 'TSUnionType': {
      const enumValues: string[] = [];
      let isEnum = true;

      typeNode.types.forEach((subType) => {
        if (
          subType.type === 'TSLiteralType' &&
          subType.literal.type === 'Literal' &&
          typeof subType.literal.value === 'string'
        ) {
          enumValues.push(subType.literal.value);
        } else {
          isEnum = false;
        }
      });

      if (isEnum) {
        return { type: 'string', enum: enumValues };
      }
      return { type: 'unknown' };
    }
    default:
      return { type: 'unknown' };
  }
};

const computeFunctionParameters = (
  funcNode: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression,
  schema: InputSchema,
): InputSchema => {
  return funcNode.params.reduce((updatedSchema, param) => {
    if (param.type === 'Identifier') {
      return [
        ...updatedSchema,
        getTypeString(param.typeAnnotation?.typeAnnotation),
      ];
    } else if (param.type === 'ObjectPattern') {
      // destructured params
      const properties: InputSchemaProperty['properties'] = {};
      param.properties.forEach((p) => {
        if (
          p.type === 'Property' &&
          p.key.type === 'Identifier' &&
          p.value.type === 'Identifier'
        ) {
          properties[p.key.name] = getTypeString(
            p.value.typeAnnotation?.typeAnnotation,
          );
        }
      });
      return [...updatedSchema, { type: 'object', properties }];
    }
    return [...updatedSchema, { type: 'unknown' }];
  }, schema);
};

export const getFunctionInputSchema = (fileContent: string): InputSchema => {
  const ast = parse(fileContent, { loc: false, range: false });
  let schema: InputSchema = [];

  ast.body.forEach((node) => {
    if (node.type === 'FunctionDeclaration') {
      schema = computeFunctionParameters(node, schema);
    } else if (
      node.type === 'VariableDeclaration' &&
      node.declarations[0]?.init?.type === 'ArrowFunctionExpression'
    ) {
      schema = computeFunctionParameters(node.declarations[0].init, schema);
    } else if (
      node.type === 'ExportNamedDeclaration' &&
      isDefined(node.declaration)
    ) {
      if (node.declaration.type === 'FunctionDeclaration') {
        schema = computeFunctionParameters(node.declaration, schema);
      } else if (
        node.declaration.type === 'VariableDeclaration' &&
        node.declaration.declarations[0]?.init?.type ===
          'ArrowFunctionExpression'
      ) {
        schema = computeFunctionParameters(
          node.declaration.declarations[0].init,
          schema,
        );
      }
    }
  });

  return schema;
};
