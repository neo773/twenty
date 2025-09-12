import {
  type InputSchema,
  type InputSchemaProperty,
} from '@/workflow/types/InputSchema';
import { parse } from '@babel/parser';
import { isDefined } from 'twenty-shared/utils';

interface BabelNode {
  type: string;
  [key: string]: any;
}

const getTypeString = (typeNode: BabelNode): InputSchemaProperty => {
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
        typeNode.members.forEach((member: BabelNode) => {
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
        typeNode.types.forEach((subType: BabelNode) => {
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

const isFunction = (node: BabelNode): boolean => {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  );
};

const computeFunctionParameters = (
  funcNode: BabelNode,
  schema: InputSchema,
): InputSchema => {
  if (!isDefined(funcNode.params)) {
    return schema;
  }

  return funcNode.params.reduce(
    (updatedSchema: InputSchema, param: BabelNode) => {
      const typeAnnotation = param.typeAnnotation;

      if (isDefined(typeAnnotation?.typeAnnotation)) {
        return [...updatedSchema, getTypeString(typeAnnotation.typeAnnotation)];
      }

      return [...updatedSchema, { type: 'unknown' }];
    },
    schema,
  );
};

const extractFunctions = (node: BabelNode): BabelNode[] => {
  if (node.type === 'FunctionDeclaration' && isFunction(node)) {
    return [node];
  }

  if (node.type === 'VariableDeclaration' && isDefined(node.declarations)) {
    return node.declarations
      .filter(
        (declaration: BabelNode) =>
          isDefined(declaration.init) && isFunction(declaration.init),
      )
      .map((declaration: BabelNode) => declaration.init)
      .filter(isDefined);
  }

  if (node.type === 'ExportNamedDeclaration' && isDefined(node.declaration)) {
    return extractFunctions(node.declaration);
  }

  return [];
};

export const getFunctionInputSchema = (fileContent: string): InputSchema => {
  const ast = parse(fileContent, {
    sourceType: 'module',
    plugins: ['typescript'],
  });

  let schema: InputSchema = [];

  ast.program.body.forEach((node: BabelNode) => {
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

  return schema;
};
