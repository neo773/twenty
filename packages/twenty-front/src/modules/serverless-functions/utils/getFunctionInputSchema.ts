import {
  type InputSchema,
  type InputSchemaProperty,
} from '@/workflow/types/InputSchema';
import { tsPlugin } from '@sveltejs/acorn-typescript';
import * as acorn from 'acorn';
import { isDefined } from 'twenty-shared/utils';

type TSTypeNode = {
  type: string;
  elementType?: TSTypeNode;
  members?: Array<{
    type: string;
    key?: { name: string };
    typeAnnotation?: { typeAnnotation: TSTypeNode };
  }>;
  types?: TSTypeNode[];
  literal?: { value: string | number | boolean };
  typeName?: { name: string };
};

type ExtendedNode = {
  type: string;
  typeAnnotation?: {
    type: 'TSTypeAnnotation';
    typeAnnotation: TSTypeNode;
  };
  params?: ExtendedNode[];
  declarations?: { init?: ExtendedNode }[];
  declaration?: ExtendedNode;
  body?: ExtendedNode[];
};

const getTypeString = (typeNode: TSTypeNode): InputSchemaProperty => {
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
        items: typeNode.elementType
          ? getTypeString(typeNode.elementType)
          : { type: 'unknown' },
      };
    case 'TSObjectKeyword':
      return { type: 'object' };
    case 'TSTypeLiteral': {
      const properties: InputSchemaProperty['properties'] = {};

      if (isDefined(typeNode.members)) {
        typeNode.members.forEach((member) => {
          if (
            member.type === 'TSPropertySignature' &&
            isDefined(member.key?.name) &&
            isDefined(member.typeAnnotation?.typeAnnotation)
          ) {
            const memberName = member.key.name;
            properties[memberName] = getTypeString(
              member.typeAnnotation.typeAnnotation,
            );
          }
        });
      }

      return { type: 'object', properties };
    }
    case 'TSUnionType': {
      const enumValues: string[] = [];
      let isEnum = true;

      if (isDefined(typeNode.types)) {
        typeNode.types.forEach((subType) => {
          if (subType.type === 'TSLiteralType' && isDefined(subType.literal)) {
            if (typeof subType.literal.value === 'string') {
              enumValues.push(subType.literal.value);
            } else {
              isEnum = false;
            }
          } else {
            isEnum = false;
          }
        });
      }

      if (isEnum && enumValues.length > 0) {
        return { type: 'string', enum: enumValues };
      }

      return { type: 'unknown' };
    }
    case 'TSTypeReference':
      return typeNode.typeName?.name === 'object'
        ? { type: 'object' }
        : { type: 'unknown' };
    default:
      return { type: 'unknown' };
  }
};

const isFunction = (node: ExtendedNode): boolean => {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  );
};

const computeFunctionParameters = (
  funcNode: ExtendedNode,
  schema: InputSchema,
): InputSchema => {
  if (!isDefined(funcNode.params)) {
    return schema;
  }

  return funcNode.params.reduce((updatedSchema, param) => {
    const typeAnnotation = param.typeAnnotation;

    if (isDefined(typeAnnotation?.typeAnnotation)) {
      return [...updatedSchema, getTypeString(typeAnnotation.typeAnnotation)];
    }

    return [...updatedSchema, { type: 'unknown' }];
  }, schema);
};

const extractFunctions = (node: ExtendedNode): ExtendedNode[] => {
  if (node.type === 'FunctionDeclaration' && isFunction(node)) {
    return [node];
  }

  if (node.type === 'VariableDeclaration' && isDefined(node.declarations)) {
    return node.declarations
      .filter(
        (declaration) =>
          isDefined(declaration.init) && isFunction(declaration.init),
      )
      .map((declaration) => declaration.init!)
      .filter(isDefined);
  }

  if (node.type === 'ExportNamedDeclaration' && isDefined(node.declaration)) {
    return extractFunctions(node.declaration);
  }

  return [];
};

export const getFunctionInputSchema = (fileContent: string): InputSchema => {
  const ast = acorn.Parser.extend(tsPlugin()).parse(fileContent, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }) as ExtendedNode;

  let schema: InputSchema = [];

  if (isDefined(ast.body)) {
    ast.body.forEach((node) => {
      if (
        node.type === 'FunctionDeclaration' ||
        node.type === 'VariableDeclaration' ||
        node.type === 'ExportNamedDeclaration'
      ) {
        const functions = extractFunctions(node);
        functions.forEach((func) => {
          schema = computeFunctionParameters(func, schema);
        });
      }
    });
  }

  return schema;
};
