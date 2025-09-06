import { Logger } from '../utils/logger.js';

/**
 * 块类型接口
 */
export interface FeishuBlock {
  block_type: number;
  [key: string]: any;
}

/**
 * 文本样式接口
 */
export interface TextElementStyle {
  bold?: boolean;        // 是否加粗
  italic?: boolean;      // 是否斜体
  underline?: boolean;   // 是否下划线
  strikethrough?: boolean; // 是否删除线
  inline_code?: boolean; // 是否行内代码
  text_color?: number;   // 文本颜色
}

/**
 * 文本内容接口
 */
export interface TextContent {
  text: string;          // 文本内容
  style?: TextElementStyle; // 文本样式
}

/**
 * 公式内容接口
 */
export interface EquationContent {
  equation: string;      // 公式内容
  style?: TextElementStyle; // 文本样式
}

/**
 * 文本元素类型 - 可以是普通文本或公式
 */
export type TextElement = TextContent | EquationContent;

/**
 * 文本块接口
 */
export interface TextBlock extends FeishuBlock {
  block_type: 2;         // 文本块类型固定为2
  text: {
    elements: Array<{
      text_run: {
        content: string;
        text_element_style: TextElementStyle;
      }
    }>;
    style: {
      align: number;      // 对齐方式：1左对齐，2居中，3右对齐
    }
  };
}

/**
 * 代码块接口
 */
export interface CodeBlock extends FeishuBlock {
  block_type: 14;        // 代码块类型固定为14
  code: {
    elements: Array<{
      text_run: {
        content: string;
        text_element_style: TextElementStyle;
      }
    }>;
    style: {
      language: number;   // 语言类型代码
      wrap: boolean;      // 是否自动换行
    }
  };
}

/**
 * 标题块接口
 */
export interface HeadingBlock extends FeishuBlock {
  block_type: number;    // 标题块类型：3-11（对应标题级别1-9）
  [headingKey: string]: any; // 动态属性名，如heading1, heading2等
}

/**
 * 块类型枚举
 */
export enum BlockType {
  TEXT = 'text',
  CODE = 'code',
  HEADING = 'heading',
  LIST = 'list',
  IMAGE = 'image'
}

/**
 * 对齐方式枚举
 */
export enum AlignType {
  LEFT = 1,
  CENTER = 2,
  RIGHT = 3
}

/**
 * 块工厂类
 * 提供统一接口创建不同类型的块内容
 */
export class BlockFactory {
  private static instance: BlockFactory;
  
  private constructor() {}
  
  /**
   * 获取块工厂实例
   * @returns 块工厂实例
   */
  public static getInstance(): BlockFactory {
    if (!BlockFactory.instance) {
      BlockFactory.instance = new BlockFactory();
    }
    return BlockFactory.instance;
  }
  
  /**
   * 获取默认的文本元素样式
   * @returns 默认文本元素样式
   */
  public static getDefaultTextElementStyle(): TextElementStyle {
    return {
      bold: false,
      inline_code: false,
      italic: false,
      strikethrough: false,
      underline: false
    };
  }
  
  /**
   * 应用默认文本样式
   * @param style 已有样式（可选）
   * @returns 合并后的样式
   */
  public static applyDefaultTextStyle(style?: TextElementStyle): TextElementStyle {
    const defaultStyle = BlockFactory.getDefaultTextElementStyle();
    return style ? { ...defaultStyle, ...style } : defaultStyle;
  }
  
  /**
   * 创建块内容
   * @param type 块类型
   * @param options 块选项
   * @returns 块内容对象
   */
  public createBlock(type: BlockType, options: any): FeishuBlock {
    switch (type) {
      case BlockType.TEXT:
        return this.createTextBlock(options);
      case BlockType.CODE:
        return this.createCodeBlock(options);
      case BlockType.HEADING:
        return this.createHeadingBlock(options);
      case BlockType.LIST:
        return this.createListBlock(options);
      case BlockType.IMAGE:
        return this.createImageBlock(options);
      default:
        Logger.error(`不支持的块类型: ${type}`);
        throw new Error(`不支持的块类型: ${type}`);
    }
  }
  
  /**
   * 创建文本块内容
   * @param options 文本块选项
   * @returns 文本块内容对象
   */
  public createTextBlock(options: {
    textContents: Array<TextElement>,
    align?: AlignType
  }): FeishuBlock {
    const { textContents, align = AlignType.LEFT } = options;
    
    return {
      block_type: 2, // 2表示文本块
      text: {
        elements: textContents.map(content => {
          // 检查是否是公式元素
          if ('equation' in content) {
            return {
              equation: {
                content: content.equation,
                text_element_style: BlockFactory.applyDefaultTextStyle(content.style)
              }
            };
          } else {
            // 普通文本元素
            return {
              text_run: {
                content: content.text,
                text_element_style: BlockFactory.applyDefaultTextStyle(content.style)
              }
            };
          }
        }),
        style: {
          align: align, // 1 居左，2 居中，3 居右
          folded: false
        }
      }
    };
  }
  
  /**
   * 创建代码块内容
   * @param options 代码块选项
   * @returns 代码块内容对象
   */
  public createCodeBlock(options: {
    code: string,
    language?: number,
    wrap?: boolean
  }): FeishuBlock {
    const { code, language = 0, wrap = false } = options;
    // 校验 language 合法性，飞书API只允许1~75
    const safeLanguage = language >= 1 && language <= 75 ? language : 1;
    
    return {
      block_type: 14, // 14表示代码块
      code: {
        elements: [
          {
            text_run: {
              content: code,
              text_element_style: BlockFactory.getDefaultTextElementStyle()
            }
          }
        ],
        style: {
          language: safeLanguage,
          wrap: wrap
        }
      }
    };
  }
  
  /**
   * 创建标题块内容
   * @param options 标题块选项
   * @returns 标题块内容对象
   */
  public createHeadingBlock(options: {
    text: string,
    level?: number,
    align?: AlignType
  }): FeishuBlock {
    const { text, level = 1, align = AlignType.LEFT } = options;
    
    // 确保标题级别在有效范围内（1-9）
    const safeLevel = Math.max(1, Math.min(9, level));
    
    // 根据标题级别设置block_type和对应的属性名
    // 飞书API中，一级标题的block_type为3，二级标题为4，以此类推
    const blockType = 2 + safeLevel; // 一级标题为3，二级标题为4，以此类推
    const headingKey = `heading${safeLevel}`; // heading1, heading2, ...
    
    // 构建块内容
    const blockContent: any = {
      block_type: blockType
    };
    
    // 设置对应级别的标题属性
    blockContent[headingKey] = {
      elements: [
        {
          text_run: {
            content: text,
            text_element_style: BlockFactory.getDefaultTextElementStyle()
          }
        }
      ],
      style: {
        align: align,
        folded: false
      }
    };
    
    return blockContent;
  }
  
  /**
   * 创建列表块内容（有序或无序）
   * @param options 列表块选项
   * @returns 列表块内容对象
   */
  public createListBlock(options: {
    text: string,
    isOrdered?: boolean,
    align?: AlignType
  }): FeishuBlock {
    const { text, isOrdered = false, align = AlignType.LEFT } = options;
    
    // 有序列表是 block_type: 13，无序列表是 block_type: 12
    const blockType = isOrdered ? 13 : 12;
    const propertyKey = isOrdered ? "ordered" : "bullet";
    
    // 构建块内容
    const blockContent: any = {
      block_type: blockType
    };
    
    // 设置列表属性
    blockContent[propertyKey] = {
      elements: [
        {
          text_run: {
            content: text,
            text_element_style: BlockFactory.getDefaultTextElementStyle()
          }
        }
      ],
      style: {
        align: align,
        folded: false
      }
    };
    
    return blockContent;
  }
  
  /**
   * 创建图片块内容（空图片块，需要后续设置图片资源）
   * @param options 图片块选项
   * @returns 图片块内容对象
   */
  public createImageBlock(options: {
    width?: number,
    height?: number
  } = {}): FeishuBlock {
    const { width = 100, height = 100 } = options;
    
    return {
      block_type: 27, // 27表示图片块
      image: {
        width: width,
        height: height,
        token: "" // 空token，需要后续通过API设置
      }
    };
  }
}