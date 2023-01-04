import { Transforms } from ".";
import { Editor } from "../interfaces/editor";
import { Location } from "../interfaces/location";
import { Node } from '../interfaces/node';
import { Path } from "../interfaces/path";
import { Point } from "../interfaces/point";
import { Range } from "../interfaces/range";

interface SetNodeOptions {
  at?: Location
}

export interface NodeTransforms {
  insertNode: (editor: Editor, node: Node, options?: { select?: boolean; at?: Location }) => void;
  splitNodes: (editor: Editor, options: { at: Point }) => void;
  setNode: (editor: Editor, props: Partial<Node>, options?: SetNodeOptions) => void;
  mergeNodes: (editor: Editor, options: { at: Path, position: number } ) => void;
  removeNode: (editor: Editor, options: { at: Path }) => void;
}

// eslint-disable-next-line no-redeclare
export const NodeTransforms: NodeTransforms = {
  splitNodes: (editor: Editor, options: { at: Point }) => {
    Editor.withoutNormalizing(editor, () => {
      const { at } = options;
      // 处于节点最左边或者最右边不处理
      if (Editor.isEdge(editor, at, at.path)) {
        return;
      }
      editor.apply({
        type: 'split_node',
        position: at.offset,
        path: at.path,
      });
    });
  },

  /**
   * 1. 对于在 point 中 insertNode，以 point 为中心将 textNode 分割为前后，随后插入节点
   * 2. 对于在 path 中 insertNode，就直接插入
   * 3. 对于在 range 中 insertNode，如果 range 是 collapsed 跟 point 处理同理，如果是非collaspd，将选中的 range 删除，随后插入
   */
  insertNode: (
    editor: Editor,
    node: Node,
    options?: { select?: boolean; at?: Location }
  ) => {
    Editor.withoutNormalizing(editor, () => {
      let { select = true, at = editor.selection} = options || {}
      /**
       * 1. 将 at 处理成 path
       */
      if (Range.isRange(at)) {
        if (Range.isCollapsed(at)) {
          at = at.anchor;
        } else {
          // 把对应的文本删除，随后插入
          const [, end] = Range.edges(at);
          const pointRef = Editor.pointRef(editor, end);
          Transforms.delete(editor, { at });
          at = pointRef.unref()!;
        }
      }
      if (Point.isPoint(at)) {
        const isAtEnd = Editor.isEdge(editor, at, at.path);
        
        // 1. 先将 node 按照 at 位置分割
        const pathRef = Editor.pathRef(editor, at.path);
        Transforms.splitNodes(editor, { at });
        const path = pathRef.unref()!;
             
        // 如果是在节点的边缘插入插入新节点，因为在边缘节点不会去 splitNode，所以此时的 path 的值不会改变，所以需要手动指向 next
        at = isAtEnd ? Path.next(path) : path;
      }

      /**
       * 2. 将 node 插入到 at 的位置
       */
      if (!at) {
        return;
      }
      editor.apply({
        type: 'insert_node',
        node,
        path: at,
      });

      // 3. 光标选中到插入的节点
      if (select) {
        const point = Editor.point(editor, at, { edge: 'end' });
        Transforms.select(editor, point);
      }
    });
  },

  /**
   * 1. 对于在 range 中 insertNode，如果 range 是 collapsed 不处理，如果是非collaspd，将选中的 range 进行 splitNode
   */
  setNode: (editor: Editor, props: Partial<Node>, options?: SetNodeOptions) => {
    Editor.withoutNormalizing(editor, () => {
      let { at = editor.selection } = options || {};
      if (!at) {
        return;
      }

      if (Range.isRange(at)) {
        if (Range.isCollapsed(at)) {
          return;
        }
        // 1. 光标扩展先对节点进行分割
        const rangeRef = Editor.rangeRef(editor, at, { affinity: 'inward' });
        /**
        * 从后到前分割好处：end 拆分为多个 node 对于 start 的 path 无影响
        * 从前到后：start 拆分为多个 node 对于 end 的 path 会有影响
        */
        const [start, end] = Range.edges(at);
        Transforms.splitNodes(editor, { at: end });
        Transforms.splitNodes(editor, { at: start });
        at = rangeRef.unref()!;

        // 2. 对选区的节点增加 mark
        for (const [textNode, textNodePath] of Node.texts(editor, { 
          from: at.anchor.path, 
          to: at.focus.path,
          reverse: Range.isBackward(at),
        })) {
          let hasChanges = false;
          for (const k in props) {
            if (k === 'children' || k === 'text') {
              continue
            }
  
            if (props[k] !== textNode[k]) {
              hasChanges = true;
              break;
            }
          }
  
          if (hasChanges) {
            editor.apply({
              type: 'set_node',
              newProperties: props,
              path: textNodePath,
            })
          }
        }
      }
    });
  },

  mergeNodes: (editor: Editor, options: { at: Path, position: number }) => {
    Editor.withoutNormalizing(editor, () => {
      editor.apply({
        type: 'merge_node',
        path: options.at,
        position: options.position
      });
    });
  },

  removeNode: (editor: Editor, options: { at: Path }) => {
    Editor.withoutNormalizing(editor, () => {
      editor.apply({
        type: 'remove_node',
        path: options.at
      });
    });
  }
}
