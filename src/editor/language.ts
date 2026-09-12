import type * as Monaco from "monaco-editor";
import { useStore } from "../project/store";
import { easeTypes, parseColor } from "../runtime/ease";
import { preprocessShader } from "../shaders/preprocess";
export function registerLanguage(monaco: typeof Monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === "motionscript"))
    return;
  monaco.languages.register({ id: "motionscript", extensions: [".motion"] });
  monaco.languages.setMonarchTokensProvider("motionscript", {
    keywords: [
      "let",
      "const",
      "var",
      "function",
      "if",
      "else",
      "for",
      "while",
      "return",
      "true",
      "false",
      "group",
      "break",
      "continue",
      "new",
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"#[0-9a-fA-F]{6}"/, "string.color"],
        [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/, "string"],
        [
          /\b(text|draw|image|rect|circle|shader|ease|audio|random)\b/,
          "function",
        ],
        [
          /\b(time|frame|fps|width|height|resolution|mouse)\b/,
          "variable.predefined",
        ],
        [
          /[a-zA-Z_$][\w$]*/,
          { cases: { "@keywords": "keyword", "@default": "identifier" } },
        ],
        [/\d+(\.\d+)?/, "number"],
        [/[{}()[\]]/, "@brackets"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("motionscript", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "'", close: "'", notIn: ["string"] },
      { open: "`", close: "`", notIn: ["string"] },
      { open: "/*", close: "*/", notIn: ["string"] },
    ],
    indentationRules: {
      increaseIndentPattern: /^.*\{[^}]*$/,
      decreaseIndentPattern: /^\s*\}/,
    },
  });
  monaco.editor.defineTheme("motion-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "c7b5d6" },
      { token: "function", foreground: "adc3d5" },
      { token: "string", foreground: "c6c9bd" },
      { token: "string.color", foreground: "adc3d5" },
      { token: "number", foreground: "c6b5a7" },
      { token: "comment", foreground: "81858b" },
      { token: "variable.predefined", foreground: "b6bfca" },
    ],
    colors: {
      "editor.background": "#202124",
      "editor.foreground": "#d8d9dc",
      "editorLineNumber.foreground": "#72757c",
      "editorLineNumber.activeForeground": "#d2d4d8",
      "editor.lineHighlightBackground": "#27282c",
      "editor.selectionBackground": "#454850",
      "editorCursor.foreground": "#e0e1e4",
      "editorIndentGuide.background1": "#34363c",
      "editorWidget.background": "#2b2d32",
      "editorSuggestWidget.background": "#2b2d32",
    },
  });
  monaco.languages.registerCompletionItemProvider("motionscript", {
    triggerCharacters: ["(", ",", '"', "'", "."],
    provideCompletionItems(model, position) {
      const prefix = model.getValue().slice(0, model.getOffsetAt(position));
      const word = model.getWordUntilPosition(position),
        range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
      const call = contextAt(prefix);
      const assets = useStore.getState().project.assets;
      const suggestions: Monaco.languages.CompletionItem[] = [];
      const add = (
        label: string,
        insertText: string,
        detail: string,
        kind = monaco.languages.CompletionItemKind.Function,
      ) =>
        suggestions.push({
          label,
          insertText,
          detail,
          kind,
          range,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        });
      const quote = /["'][^"']*$/.test(prefix.slice(prefix.lastIndexOf("\n")))
        ? ""
        : '"';
      if (call?.name === "ease" && call.index === 0)
        easeTypes.forEach((t) =>
          add(
            t,
            `${quote}${t}${quote}`,
            "Easing curve",
            monaco.languages.CompletionItemKind.EnumMember,
          ),
        );
      const type =
        call?.name === "text" && call.index === 1
          ? "font"
          : call?.name === "shader" && call.index === 0
            ? "shader"
            : call?.name === "audio" && call.index === 0
              ? "audio"
              : ["draw", "image"].includes(call?.name ?? "") &&
                  call?.index === 0
                ? "visual"
                : null;
      if (type)
        assets
          .filter((a) =>
            type === "visual"
              ? ["image", "video"].includes(a.type)
              : a.type === type,
          )
          .forEach((a) =>
            add(
              a.name,
              `${quote}${a.name}${quote}`,
              `${a.type} · ${a.id.slice(0, 8)}`,
              monaco.languages.CompletionItemKind.File,
            ),
          );
      if (!type && !(call?.name === "ease" && call.index === 0)) {
        add(
          "text",
          'text("${1:Hello}", { font: "Inter", position: [${2:0}, ${3:0}, 0], size: ${4:120}, color: "${5:#ffffff}" });',
          "Typography",
        );
        add(
          "draw",
          'draw("${1:asset}", ${2:0}, ${3:0}, 0, 1, 0, 5, "#ffffff");',
          "Image or video",
        );
        add("group", "group {\n    ${1}\n}", "Isolated group");
        add(
          "ease",
          'ease("${1:out}", ${2:0}, ${3:1}, ${4:0}, ${5:1}, 2, 0)',
          "Time interpolation",
        );
        add("shader", 'shader("${1:glitch.frag}", ${2:0.5});', "Group shader");
        add(
          "anchorPoint",
          "anchorPoint: [${1:0}, ${2:0}]",
          "Pivot in pixels from the object center; +Y up",
          monaco.languages.CompletionItemKind.Property,
        );
        add(
          "rect",
          'rect({ position: [${1:0}, ${2:0}, 0], width: 300, height: 120, color: "#c5c7ce" });',
          "Rectangle",
        );
        for (const value of [
          "time",
          "frame",
          "fps",
          "width",
          "height",
          "resolution",
          "mouse.x",
          "mouse.y",
          "audio.level",
          "audio.bass",
          "audio.mid",
          "audio.high",
        ])
          add(
            value,
            value,
            "Frame context",
            monaco.languages.CompletionItemKind.Variable,
          );
      }
      return { suggestions };
    },
  });
  monaco.languages.registerSignatureHelpProvider("motionscript", {
    signatureHelpTriggerCharacters: ["(", ","],
    provideSignatureHelp(model, position) {
      const call = contextAt(
        model.getValue().slice(0, model.getOffsetAt(position)),
      );
      const signatures: Record<string, string[]> = {
        text: [
          "content",
          "font / options",
          "x",
          "y",
          "z",
          "scale",
          "t1",
          "t2",
          "color",
          "anchorPoint = [0, 0]",
        ],
        draw: [
          "media",
          "x / options",
          "y",
          "z",
          "scale",
          "t1",
          "t2",
          "color",
          "anchorPoint = [0, 0]",
        ],
        ease: ["type", "v0", "v1", "t0", "t1", "power = 2", "speed = 0"],
        shader: ["shader", "uniforms"],
        audio: ["media", "volume = 1", "start = 0"],
      };
      if (!call || !signatures[call.name]) return null;
      const parameters = signatures[call.name];
      return {
        value: {
          signatures: [
            {
              label: `${call.name}(${parameters.join(", ")})`,
              parameters: parameters.map((label) => ({ label })),
            },
          ],
          activeSignature: 0,
          activeParameter: Math.min(call.index, parameters.length - 1),
        },
        dispose() {},
      };
    },
  });
  monaco.languages.registerColorProvider("motionscript", {
    provideDocumentColors(model) {
      const results: Monaco.languages.IColorInformation[] = [];
      for (const match of model
        .getValue()
        .matchAll(/["'](#[0-9a-fA-F]{6})["']/g)) {
        const start = model.getPositionAt(match.index! + 1),
          end = model.getPositionAt(match.index! + 8),
          c = parseColor(match[1])!;
        results.push({
          color: { red: c[0], green: c[1], blue: c[2], alpha: 1 },
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
        });
      }
      return results;
    },
    provideColorPresentations(_model, info) {
      const hex =
        "#" +
        [info.color.red, info.color.green, info.color.blue]
          .map((v) =>
            Math.round(v * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
      return [{ label: hex, textEdit: { range: info.range, text: hex } }];
    },
  });
  monaco.languages.registerHoverProvider("motionscript", {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (word?.word === "ease")
        return {
          contents: [
            {
              value:
                "**ease(type, v0, v1, t0, t1, power, speed)**\n\nExplicit project time. Expo curves ignore power. Speed adds an elastic oscillation (1 - cos(elapsed * speed)) to the remaining distance; speed = 0 is plain easing.",
            },
          ],
        };
      const a = useStore
        .getState()
        .project.assets.find((a) => a.name === word?.word);
      if (a)
        return {
          contents: [
            { value: `**${a.name}** · ${a.type}\n\nUUID: \`${a.id}\`` },
          ],
        };
      return null;
    },
  });
  monaco.languages.register({ id: "motion-glsl" });
  monaco.languages.setMonarchTokensProvider("motion-glsl", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [
          /\b(uniform|void|return|float|int|bool|vec[234]|mat[234]|in|out|precision|highp)\b/,
          "keyword",
        ],
        [
          /\b(u_time|u_pixel|u_resolution|u_mouse|image)\b/,
          "variable.predefined",
        ],
        [/\d+(\.\d*)?/, "number"],
        [/[a-zA-Z_]\w*/, "identifier"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("motion-glsl", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "(", close: ")" },
    ],
  });
  monaco.languages.registerCompletionItemProvider("motion-glsl", {
    provideCompletionItems(model, position) {
      const w = model.getWordUntilPosition(position);
      return {
        suggestions: [
          "u_resolution",
          "u_time",
          "u_pixel",
          "u_mouse",
          "texture2D(image, uv)",
          "void main(image) {\n    return vec3(1.0);\n}",
          ...preprocessShader(model.getValue()).uniforms.map((u) => u.name),
        ].map((label) => ({
          label,
          insertText: label,
          kind: monaco.languages.CompletionItemKind.Variable,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: w.startColumn,
            endColumn: w.endColumn,
          },
        })),
      };
    },
  });
}
/** Count commas at the current nesting depth, ignoring strings and comments. */
export function contextAt(
  source: string,
): { name: string; index: number } | null {
  const stack: { name: string; index: number; delimiter: string }[] = [];
  let quote = "",
    comment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (comment) {
      if (c === "\n") comment = false;
      continue;
    }
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      comment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if ("([{".includes(c)) {
      const name =
        c === "(" ? (source.slice(0, i).match(/([\w$]+)\s*$/)?.[1] ?? "") : "";
      stack.push({ name, index: 0, delimiter: c });
    } else if (")]}".includes(c)) stack.pop();
    else if (c === "," && stack.length) stack[stack.length - 1].index++;
  }
  return [...stack].reverse().find((s) => s.name) || null;
}
