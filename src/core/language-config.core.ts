/**
 * Language configuration registry for Tree-sitter scope detection.
 * Adding a new language = one entry in LANGUAGE_CONFIGS.
 */
export interface LanguageConfig {
  /** VSCode language identifiers */
  languageIds: string[];
  /** Grammar WASM filename (loaded from out/grammars/) */
  wasmFile: string;
  /** AST node types that define a "scope" block */
  scopeNodeTypes: string[];
  /** Child node type that holds the scope's name */
  nameChildType?: string;
  /** Fallback strategy if WASM fails */
  fallback: 'bracket' | 'indent';
}

export const LANGUAGE_CONFIGS: LanguageConfig[] = [
  {
    languageIds: ['javascript', 'javascriptreact'],
    wasmFile: 'tree-sitter-javascript.wasm',
    scopeNodeTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition',
      'class_declaration',
      'object_expression',
      'generator_function_declaration',
    ],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['typescript', 'typescriptreact'],
    wasmFile: 'tree-sitter-typescript.wasm',
    scopeNodeTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition',
      'method_signature',
      'class_declaration',
      'interface_declaration',
      'type_alias_declaration',
      'enum_declaration',
    ],
    nameChildType: 'type_identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['python'],
    wasmFile: 'tree-sitter-python.wasm',
    scopeNodeTypes: [
      'function_definition',
      'async_function_definition',
      'class_definition',
      'decorated_definition',
    ],
    nameChildType: 'identifier',
    fallback: 'indent',
  },
  {
    languageIds: ['java'],
    wasmFile: 'tree-sitter-java.wasm',
    scopeNodeTypes: [
      'method_declaration',
      'constructor_declaration',
      'class_declaration',
      'interface_declaration',
      'enum_declaration',
      'annotation_type_declaration',
    ],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['c'],
    wasmFile: 'tree-sitter-c.wasm',
    scopeNodeTypes: ['function_definition', 'struct_specifier', 'enum_specifier'],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['cpp'],
    wasmFile: 'tree-sitter-cpp.wasm',
    scopeNodeTypes: [
      'function_definition',
      'class_specifier',
      'struct_specifier',
      'namespace_definition',
      'template_declaration',
    ],
    nameChildType: 'field_identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['go'],
    wasmFile: 'tree-sitter-go.wasm',
    scopeNodeTypes: [
      'function_declaration',
      'method_declaration',
      'type_declaration',
      'func_literal',
    ],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['rust'],
    wasmFile: 'tree-sitter-rust.wasm',
    scopeNodeTypes: [
      'function_item',
      'impl_item',
      'struct_item',
      'enum_item',
      'trait_item',
      'mod_item',
      'closure_expression',
    ],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['ruby'],
    wasmFile: 'tree-sitter-ruby.wasm',
    scopeNodeTypes: ['method', 'singleton_method', 'class', 'module', 'do_block', 'block'],
    nameChildType: 'identifier',
    fallback: 'indent',
  },
  {
    languageIds: ['php'],
    wasmFile: 'tree-sitter-php.wasm',
    scopeNodeTypes: [
      'function_definition',
      'method_declaration',
      'class_declaration',
      'interface_declaration',
      'trait_declaration',
      'anonymous_function',
    ],
    nameChildType: 'name',
    fallback: 'bracket',
  },
  {
    languageIds: ['csharp'],
    wasmFile: 'tree-sitter-c_sharp.wasm',
    scopeNodeTypes: [
      'method_declaration',
      'constructor_declaration',
      'class_declaration',
      'interface_declaration',
      'struct_declaration',
      'namespace_declaration',
      'local_function_statement',
      'lambda_expression',
    ],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['swift'],
    wasmFile: 'tree-sitter-swift.wasm',
    scopeNodeTypes: [
      'function_declaration',
      'class_declaration',
      'struct_declaration',
      'enum_declaration',
      'protocol_declaration',
      'extension_declaration',
      'closure_expression',
    ],
    nameChildType: 'simple_identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['kotlin'],
    wasmFile: 'tree-sitter-kotlin.wasm',
    scopeNodeTypes: [
      'function_declaration',
      'class_declaration',
      'object_declaration',
      'companion_object',
      'anonymous_function',
      'lambda_literal',
    ],
    nameChildType: 'simple_identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['scala'],
    wasmFile: 'tree-sitter-scala.wasm',
    scopeNodeTypes: [
      'function_definition',
      'class_definition',
      'object_definition',
      'trait_definition',
      'val_definition',
      'var_definition',
    ],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['lua'],
    wasmFile: 'tree-sitter-lua.wasm',
    scopeNodeTypes: ['function_declaration', 'local_function', 'function_definition'],
    nameChildType: 'identifier',
    fallback: 'bracket',
  },
  {
    languageIds: ['shellscript', 'bash'],
    wasmFile: 'tree-sitter-bash.wasm',
    scopeNodeTypes: ['function_definition'],
    nameChildType: 'word',
    fallback: 'bracket',
  },
];

/**
 * Look up the language config for a given VSCode language ID.
 */
export function getLanguageConfig(languageId: string): LanguageConfig | undefined {
  return LANGUAGE_CONFIGS.find((config) => config.languageIds.includes(languageId));
}

/**
 * Check if a language ID has tree-sitter support.
 */
export function isLanguageSupported(languageId: string): boolean {
  return LANGUAGE_CONFIGS.some((config) => config.languageIds.includes(languageId));
}
