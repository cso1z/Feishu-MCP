# 飞书文档 API 接口文档

## 0. 获取登录token

### 请求
```bash
curl -i -X POST 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal' \
-H 'Content-Type: application/json' \
-d '{
    "app_id": "<your_app_id>",
    "app_secret": "<your_app_secret>"
}'
```

### 返回结果
```json
{
  "app_access_token": "<access_token>",
  "code": 0,
  "expire": 6055,
  "msg": "ok",
  "tenant_access_token": "<tenant_access_token>"
}
```

## 1. 创建飞书文档

### 请求
```bash
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
    "folder_token": "<folder_token>",****
    "title": "一篇新的文档"
}'
```

### 返回结果
```json
{
  "code": 0,
  "data": {
    "document": {
      "document_id": "<document_id>",
      "revision_id": 1,
      "title": "一篇新的文档"
    }
  },
  "msg": "success"
}
```

## 2. 获取文档基本信息

### 请求
```bash
curl -i -X GET 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>' \
-H 'Authorization: Bearer <access_token>'
```

### 返回结果
```json
{
  "code": 0,
  "data": {
    "document": {
      "display_setting": {
        "show_authors": true,
        "show_comment_count": false,
        "show_create_time": false,
        "show_like_count": false,
        "show_pv": false,
        "show_related_matters": false,
        "show_uv": false
      },
      "document_id": "<document_id>",
      "revision_id": 1,
      "title": "一篇新的文档"
    }
  },
  "msg": "success"
}
```

## 3. 获取文档中的纯文本内容

### 请求
```bash
curl -i -X GET 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/raw_content?lang=0' \
-H 'Authorization: Bearer <access_token>'
```

### 返回结果
```json
{
  "code": 0,
  "data": {
    "content": "哈哈哈=1\n一级标题\n二级标题\n功能一\n功能二\n第一点\n第二点\n代码块-kotlin\n\n"
  },
  "msg": "success"
}
```

## 4. 获取文档中的块

### 请求
```bash
curl -i -X GET 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks?document_revision_id=-1&page_size=500' \
-H 'Authorization: Bearer <access_token>'
```

### 返回结果
```json
{
  "code": 0,
  "data": {
    "has_more": false,
    "items": [
      {
        "block_id": "<block_id>",
        "block_type": 1,
        "children": ["<child_block_id>"],
        "page": {
          "elements": [
            {
              "text_run": {
                "content": "示例文本",
                "text_element_style": {
                  "bold": false,
                  "inline_code": false,
                  "italic": false,
                  "strikethrough": false,
                  "underline": false
                }
              }
            }
          ],
          "style": {
            "align": 1
          }
        },
        "parent_id": ""
      }
    ]
  },
  "msg": "success"
}
```

## 5. 创建块

### 请求
```bash
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
    "children": [
        {
            "block_type": 2,
            "text": {
                "elements": [
                    {
                        "text_run": {
                            "content": "多人实时协同，插入一切元素。不仅是在线文档，更是",
                            "text_element_style": {
                                "bold": false,
                                "inline_code": false,
                                "italic": false,
                                "strikethrough": false,
                                "text_color": 5,
                                "underline": false
                            }
                        }
                    }
                ],
                "style": {
                    "align": 1,
                    "folded": false
                }
            }
        }
    ],
    "index": 0
}'
```

## 6. 添加代码块

### 请求
```bash
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-d '{
    "children": [
        {
            "block_type": 14,
            "code": {
                "elements": [
                    {
                        "text_run": {
                            "content": "hello world",
                            "text_element_style": {
                                "bold": false,
                                "inline_code": false,
                                "italic": false,
                                "strikethrough": false,
                                "underline": false
                            }
                        }
                    }
                ],
                "style": {
                    "language": 32,
                    "wrap": false
                }
            }
        }
    ],
    "index": 3
}'
```

> 注：代码块语言类型对照表：
> 1: PlainText, 2: ABAP, 3: Ada, 4: Apache, 5: Apex, 6: Assembly Language, 7: Bash, 8: CSharp, 9: C++, 10: C, 11: COBOL, 12: CSS, 13: CoffeeScript, 14: D, 15: Dart, 16: Delphi, 17: Django, 18: Dockerfile, 19: Erlang, 20: Fortran, 22: Go, 23: Groovy, 24: HTML, 25: HTMLBars, 26: HTTP, 27: Haskell, 28: JSON, 29: Java, 30: JavaScript, 31: Julia, 32: Kotlin, 33: LateX, 34: Lisp, 36: Lua, 37: MATLAB, 38: Makefile, 39: Markdown, 40: Nginx, 41: Objective-C, 43: PHP, 44: Perl, 46: Power Shell, 47: Prolog, 48: ProtoBuf, 49: Python, 50: R, 52: Ruby, 53: Rust, 54: SAS, 55: SCSS, 56: SQL, 57: Scala, 58: Scheme, 60: Shell, 61: Swift, 62: Thrift, 63: TypeScript, 64: VBScript, 65: Visual Basic, 66: XML, 67: YAML, 68: CMake, 69: Diff, 70: Gherkin, 71: GraphQL, 72: OpenGL Shading Language, 73: Properties, 74: Solidity, 75: TOML

## 7. 更新块文本内容
* 请求
```
curl -i -X PATCH 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"update_text_elements": {
		"elements": [
			{
				"text_run": {
					"content": "测试",
					"text_element_style": {
						"background_color": 2,
						"bold": true,
						"italic": true,
						"strikethrough": true,
						"text_color": 2,
						"underline": true
					}
				}
			},
			{
				"text_run": {
					"content": "文本",
					"text_element_style": {
						"italic": true
					}
				}
			}
		]
	}
}'
```
* 返回数据：
```
{
  "code": 0,
  "data": {
    "block": {
      "block_id": "<block_id>",
      "block_type": 14,
      "code": {
        "elements": [
          {
            "text_run": {
              "content": "测试",
              "text_element_style": {
                "background_color": 2,
                "bold": true,
                "inline_code": false,
                "italic": true,
                "strikethrough": true,
                "text_color": 2,
                "underline": true
              }
            }
          },
          {
            "text_run": {
              "content": "文本",
              "text_element_style": {
                "bold": false,
                "inline_code": false,
                "italic": true,
                "strikethrough": false,
                "underline": false
              }
            }
          }
        ],
        "style": {
          "wrap": true
        }
      },
      "parent_id": "<parent_block_id>"
    },
    "client_token": "<client_token>",
    "document_revision_id": 20
  },
  "msg": "success"
}
```

## 8.获取块内容
* 请求
```
curl -i -X GET 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>?document_revision_id=-1' \
-H 'Authorization: Bearer <access_token>'
```
* 返回结果
```
{
  "code": 0,
  "data": {
    "block": {
      "block_id": "<block_id>",
      "block_type": 4,
      "heading2": {
        "elements": [
          {
            "text_run": {
              "content": "测试",
              "text_element_style": {
                "background_color": 2,
                "bold": true,
                "inline_code": false,
                "italic": true,
                "strikethrough": true,
                "text_color": 2,
                "underline": true
              }
            }
          },
          {
            "text_run": {
              "content": "文本",
              "text_element_style": {
                "bold": false,
                "inline_code": false,
                "italic": true,
                "strikethrough": false,
                "underline": false
              }
            }
          }
        ],
        "style": {
          "align": 1,
          "folded": false
        }
      },
      "parent_id": "<parent_block_id>"
    }
  },
  "msg": "success"
}
```

## 9. 创建无序列表块
* 请求参数：
```
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children?document_revision_id=-1' \
-H 'Authorization: Bearer <access_token>' \
-H 'Content-Type: application/json' \
-d '{
	"children": [
		{
			"block_type": 12,
			"bullet": {
				"elements": [
					{
						"text_run": {
							"content": "无序列表二",
							"text_element_style": {
								"bold": false,
								"inline_code": false,
								"italic": false,
								"strikethrough": false,
								"underline": false
							}
						}
					}
				],
				"style": {
					"align": 1,
					"folded": false
				}
			}
		}
	],
	"index": 0
}'
```
* 返回数据
```
{
  "code": 0,
  "data": {
    "children": [
      {
        "block_id": "<block_id>",
        "block_type": 12,
        "bullet": {
          "elements": [
            {
              "text_run": {
                "content": "无序列表二",
                "text_element_style": {
                  "bold": false,
                  "inline_code": false,
                  "italic": false,
                  "strikethrough": false,
                  "underline": false
                }
              }
            }
          ],
          "style": {
            "align": 1,
            "folded": false
          }
        },
        "parent_id": "<parent_block_id>"
      }
    ],
    "client_token": "<client_token>",
    "document_revision_id": 67
  },
  "msg": "success"
}
```

## 10.创建有无列表块
* 请求参数
```
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"children": [
		{
			"block_type": 13,
			"ordered": {
				"elements": [
					{
						"text_run": {
							"content": "无序列表二",
							"text_element_style": {
								"bold": false,
								"inline_code": false,
								"italic": false,
								"strikethrough": false,
								"underline": false
							}
						}
					}
				],
				"style": {
					"align": 1,
					"folded": false
				}
			}
		}
	],
	"index": 0
}'
```
* 返回数据
```
{
  "code": 0,
  "data": {
    "children": [
      {
        "block_id": "<block_id>",
        "block_type": 13,
        "ordered": {
          "elements": [
            {
              "text_run": {
                "content": "无序列表二",
                "text_element_style": {
                  "bold": false,
                  "inline_code": false,
                  "italic": false,
                  "strikethrough": false,
                  "underline": false
                }
              }
            }
          ],
          "style": {
            "align": 1,
            "folded": false
          }
        },
        "parent_id": "<parent_block_id>"
      }
    ],
    "client_token": "<client_token>",
    "document_revision_id": 68
  },
  "msg": "success"
}
```

## 11.把wiki文档id转成documentId(只有转成documentId才能进行后续操作)
* 请求接口：
```
curl -i -X GET 'https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?obj_type=wiki&token=<wiki_token>' \
-H 'Authorization: Bearer <access_token>'
```
* 返回数据
```
{
  "code": 0,
  "data": {
    "node": {
      "creator": "<user_id>",
      "has_child": true,
      "node_create_time": "1741868733",
      "node_creator": "<user_id>",
      "node_token": "<node_token>",
      "node_type": "origin",
      "obj_create_time": "1741868733",
      "obj_edit_time": "1741868733",
      "obj_token": "<obj_token>",
      "obj_type": "docx",
      "origin_node_token": "<node_token>",
      "origin_space_id": "<space_id>",
      "owner": "<user_id>",
      "parent_node_token": "",
      "space_id": "<space_id>",
      "title": "首页"
    }
  },
  "msg": "success"
}
```

## 12. 删除块
* 请求接口：
```
curl -i -X DELETE 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children/batch_delete?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"end_index": 1,
	"start_index": 0
}'
```
* 返回数据：
```
{
  "code": 0,
  "data": {
    "client_token": "<client_token>",
    "document_revision_id": 3
  },
  "msg": "success"
}
```

### 13. 获取图片资源
* 请求接口：
```
curl -i -X GET 'https://open.feishu.cn/open-apis/drive/v1/medias/<media_id>/download?extra=%E6%97%A0' \
-H 'Authorization: Bearer <access_token>'
```
* 返回数据
返回文件二进制流

### 14.获取根文件夹信息
* 请求接口：
```
curl --location 'https://open.feishu.cn/open-apis/drive/explorer/v2/root_folder/meta' \
--header 'Authorization: Bearer <access_token>'
```
* 返回数据：
```
{
  "code": 0,
  "msg": "Success",
  "data": {
    "token": "<folder_token>",
    "id": "<folder_id>",
    "user_id": "<user_id>"
	}
}
```

### 15. 获取文件夹中的文件清单
* 请求接口：
```
curl -i -X GET 'https://open.feishu.cn/open-apis/drive/v1/files?direction=DESC&folder_token=<folder_token>&order_by=EditedTime' \
-H 'Authorization: Bearer <access_token>'
```
* 返回数据：
```
{
  "code": 0,
  "data": {
    "files": [
      {
        "created_time": "1744972693",
        "modified_time": "1744972693",
        "name": "产品优化项目",
        "owner_id": "<user_id>",
        "parent_token": "<folder_token>",
        "token": "<folder_token>",
        "type": "folder",
        "url": "https://<domain>.feishu.cn/drive/folder/<folder_token>"
      },
      {
        "created_time": "1744904770",
        "modified_time": "1744904825",
        "name": "Android",
        "owner_id": "<user_id>",
        "parent_token": "<folder_token>",
        "token": "<folder_token>",
        "type": "folder",
        "url": "https://<domain>.feishu.cn/drive/folder/<folder_token>"
      },
      {
        "created_time": "1744904794",
        "modified_time": "1744904794",
        "name": "Kotlin",
        "owner_id": "<user_id>",
        "parent_token": "<folder_token>",
        "token": "<folder_token>",
        "type": "folder",
        "url": "https://<domain>.feishu.cn/drive/folder/<folder_token>"
      },
      {
        "created_time": "1744973513",
        "modified_time": "1744973518",
        "name": "test",
        "owner_id": "<user_id>",
        "parent_token": "<folder_token>",
        "token": "<document_token>",
        "type": "docx",
        "url": "https://<domain>.feishu.cn/docx/<document_token>"
      }
    ],
    "has_more": false
  },
  "msg": "success"
}
```

### 16.新建文件夹
* 请求接口：
```
curl -i -X POST 'https://open.feishu.cn/open-apis/drive/v1/files/create_folder' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"folder_token": "<folder_token>",
	"name": "产品优化项目"
}'
```
* 返回数据：
```
{
  "code": 0,
  "data": {
    "token": "<folder_token>",
    "url": "https://<domain>.feishu.cn/drive/folder/<folder_token>"
  },
  "msg": "success"
}
```

### 17.插入图片
#### 1. 创建图片 Block
* 请求接口：
url:https://open.feishu.cn/open-apis/docx/v1/documents/:document_id/blocks/:block_id/children
```
curl --location --request POST '{url}' \
--header 'Authorization: {Authorization}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "index": 0,
  "children": [
    {
      "block_type": 27,
      "image": {}
    }
  ]
}'
```
* 返回数据：
```
{
    "code": 0,
    "data": {
        "children": [
            {
                "block_id": "<block_id>",
                // Image BlockID
                "block_type": 27,
                "image": {
                    "height": 100,
                    "token": "",
                    "width": 100
                },
                "parent_id": "<parent_block_id>"
            }
        ],
        "client_token": "bc25a4f0-9a24-4ade-9ca2-6c1db43fa61d",
        "document_revision_id": 7
    },
    "msg": ""
}
```
#### 2. 上传图片素材
url:https://open.feishu.cn/open-apis/drive/v1/medias/upload_all
* 请求数据
```
curl --location --request POST '{url}' \
--header 'Authorization: {Authorization}' \
--header 'Content-Type: multipart/form-data; boundary=---7MA4YWxkTrZu0gW' \
--form 'file= ' \ # 文件的二进制内容
--form 'file_name="test.PNG"' \ # 图片名称
--form 'parent_type="docx_image"' \ # 素材类型为 docx_image
--form 'parent_node="<block_id>"' \ # Image BlockID
--form 'size="xxx"' # 图片大小
```
* 返回数据
```
{
    "code": 0,
    "data": {
        "file_token": "<file_token>" // 图片素材 ID
    },
    "msg": "Success"
}
```
##### 3. 设置图片 Block 的素材
url:https://open.feishu.cn/open-apis/docx/v1/documents/:document_id/blocks/:block_id
```
url --location --request PATCH '{url}' \
--header 'Authorization: {Authorization}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "replace_image": {
        "token": "<file_token>" # 图片素材 ID
    }
}'
```

### 18. 搜索文档
url:https://open.feishu.cn/open-apis/suite/docs-api/search/object
* 请求数据
```
{
"search_key": "项目", //是 指定搜索的关键字。
"count": 10, //否 指定搜索返回的文件数量。取值范围为 [0,50]。
}
```
* 返回数据
```
{
    "code": 0,
    "data": {
        "docs_entities": [
            {
                "docs_token": "<document_token>",
                "docs_type": "doc",
                "owner_id": "<user_id>",
                "title": "项目进展周报"
            } 
        ],
        "has_more": true,
        "total": 59
    },
    "msg": "success"
}
```
### 19. 获取画板内容
* 请求：
  curl -i -X GET 'https://open.feishu.cn/open-apis/board/v1/whiteboards/<whiteboard_id>/nodes' \
  -H 'Authorization: Bearer <access_token>'
* 返回数据：
```
{
  "code": 0,
  "data": {
    "nodes": [
      {
        "composite_shape": {
          "type": "round_rect"
        },
        "height": 80,
        "id": "o1:20",
        "style": {
          "border_opacity": 100,
          "border_style": "solid",
          "border_width": "narrow",
          "fill_opacity": 100
        },
        "text": {
          "font_size": 14,
          "font_weight": "regular",
          "horizontal_align": "center",
          "text": "c",
          "vertical_align": "mid"
        },
        "type": "composite_shape",
        "width": 120,
        "x": -132.9912109375,
        "y": 728.19091796875
      },
      {
        "composite_shape": {
          "type": "round_rect"
        },
        "height": 80,
        "id": "o1:19",
        "style": {
          "border_opacity": 100,
          "border_style": "solid",
          "border_width": "narrow",
          "fill_opacity": 100
        },
        "text": {
          "font_size": 14,
          "font_weight": "regular",
          "horizontal_align": "center",
          "text": "b",
          "vertical_align": "mid"
        },
        "type": "composite_shape",
        "width": 120,
        "x": -132.9912109375,
        "y": 528.19091796875
      },
      {
        "height": 28.27199935913086,
        "id": "z2:10",
        "mind_map": {
          "parent_id": "z2:7"
        },
        "style": {
          "border_opacity": 100,
          "border_style": "solid",
          "border_width": "narrow",
          "fill_opacity": 100
        },
        "text": {
          "font_size": 14,
          "font_weight": "regular",
          "horizontal_align": "left",
          "text": "4",
          "vertical_align": "mid"
        },
        "type": "mind_map",
        "width": 23.770000457763672,
        "x": 633.0499877929688,
        "y": 629.5496215820312
      },
      {
        "height": 48,
        "id": "z2:7",
        "mind_map": {
          "parent_id": ""
        },
        "style": {
          "border_opacity": 100,
          "border_style": "solid",
          "border_width": "narrow",
          "fill_opacity": 100
        },
        "text": {
          "font_size": 16,
          "font_weight": "bold",
          "horizontal_align": "center",
          "text": "1",
          "vertical_align": "mid"
        },
        "type": "mind_map",
        "width": 49.42399978637695,
        "x": 523.6259765625,
        "y": 567.4136352539062
      },
      {
        "height": 28.27199935913086,
        "id": "z2:9",
        "mind_map": {
          "parent_id": "z2:7"
        },
        "style": {
          "border_opacity": 100,
          "border_style": "solid",
          "border_width": "narrow",
          "fill_opacity": 100
        },
        "text": {
          "font_size": 14,
          "font_weight": "regular",
          "horizontal_align": "left",
          "text": "3",
          "vertical_align": "mid"
        },
        "type": "mind_map",
        "width": 23.770000457763672,
        "x": 633.0499877929688,
        "y": 577.2776489257812
      } 
    ]
  },
  "msg": ""
}
```
## 20. 获取画板缩略图
* 请求：  curl -i -X GET 'https://open.feishu.cn/open-apis/board/v1/whiteboards/<whiteboard_id>/download_as_image' \
  -H 'Authorization: Bearer <access_token>'
* 二进制图片


## 21. 创建Mermaid
* 请求参数
```
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"children": [
		{
			"add_ons": {
				"component_id": "",
				"component_type_id": "blk_631fefbbae02400430b8f9f4",
				"record": "{\"data\":\"graph TD\\n    A[Kotlin111源代码] --\\u003e|编译| B[Gradle编译过程]\\n    B --\\u003e C{CoroutineTracker\\u003cbr/\\u003e插件}\\n    C --\\u003e|字节码插桩| D[注入追踪代码]\\n    C --\\u003e|配置解析| E[过滤规则]\\n    \\n    D --\\u003e F[运行时追踪]\\n    E --\\u003e F\\n    \\n    F --\\u003e G{追踪方式}\\n    G --\\u003e|方式1| H[拦截器追踪]\\n    G --\\u003e|方式2| I[线程追踪]\\n    \\n    H --\\u003e J[日志输出]\\n    I --\\u003e J\\n    \\n    J --\\u003e K[问题分析]\\n    K --\\u003e L[性能优化]\\n    \\n    style A fill:#d0e1f9,stroke:#4a90e2\\n    style C fill:#fbe5d6,stroke:#ed7d31\\n    style F fill:#e2f0d9,stroke:#70ad47\\n    style G fill:#fff2cc,stroke:#ffd700\\n    style K fill:#f4cccc,stroke:#cc0000\\n\",\"theme\":\"default\",\"view\":\"codeChart\"}"
			},
			"block_type": 40
		}
	],
	"index": 0
}'
```
* 返回数据
```
{
  "code": 0,
  "data": {
    "children": [
      {
        "add_ons": {
          "component_id": "",
          "component_type_id": "blk_631fefbbae02400430b8f9f4",
          "record": "{\"data\":\"graph TD\\n    A[Kotlin111源代码] -->|编译| B[Gradle编译过程]\\n    B --> C{CoroutineTracker<br/>插件}\\n    C -->|字节码插桩| D[注入追踪代码]\\n    C -->|配置解析| E[过滤规则]\\n    \\n    D --> F[运行时追踪]\\n    E --> F\\n    \\n    F --> G{追踪方式}\\n    G -->|方式1| H[拦截器追踪]\\n    G -->|方式2| I[线程追踪]\\n    \\n    H --> J[日志输出]\\n    I --> J\\n    \\n    J --> K[问题分析]\\n    K --> L[性能优化]\\n    \\n    style A fill:#d0e1f9,stroke:#4a90e2\\n    style C fill:#fbe5d6,stroke:#ed7d31\\n    style F fill:#e2f0d9,stroke:#70ad47\\n    style G fill:#fff2cc,stroke:#ffd700\\n    style K fill:#f4cccc,stroke:#cc0000\\n\",\"theme\":\"default\",\"view\":\"codeChart\"}"
        },
        "block_id": "<block_id>",
        "block_type": 40,
        "parent_id": "<parent_block_id>"
      }
    ],
    "client_token": "<client_token>",
    "document_revision_id": 84
  },
  "msg": "success"
}
```

20. 权限
* 获取块："contact:user.employee_id:readonly",
    "docx:document",
    "docx:document:readonly"
* 创建文档： "docx:document",
  "docx:document:create"
* 创建块：    "contact:user.employee_id:readonly",
  "docx:document"
* 创建嵌套块： "contact:user.employee_id:readonly",
  "docx:document"
* 更新块：  "contact:user.employee_id:readonly",
  "docx:document"
* 获取块内容：  "contact:user.employee_id:readonly",
  "docx:document",
  "docx:document:readonly"
* 获取所有子块：  "contact:user.employee_id:readonly",
  "docx:document",
  "docx:document:readonly"
* 删除块：   "docx:document"
* 获取画板缩略图片： "board:whiteboard:node:read"
* 获取所有画板节点：  "board:whiteboard:node:read",
  "contact:user.employee_id:readonly"
* 创建画板块： "docx:document"
* 填充画板内容（创建 PlantUML 节点）： "board:whiteboard:node:write"
* wiki转节点： "wiki:node:read",
  "wiki:wiki",
  "wiki:wiki:readonly"
* 搜索云文档：
* 上传图片：   "bitable:app",
  "docs:doc",
  "docs:document.media:upload",
  "drive:drive",
  "sheets:spreadsheet"
* 下载图片：  "bitable:app",
  "bitable:app:readonly",
  "docs:doc",
  "docs:doc:readonly",
  "docs:document.media:download",
  "drive:drive",
  "drive:drive:readonly",
  "sheets:spreadsheet",
  "sheets:spreadsheet:readonly"
* 刷新token:offline_access

## 22. 创建画板块并填充内容

### 22.1 创建画板块（空块）
* 请求接口：
```
curl -i -X POST 'https://open.feishu.cn/open-apis/docx/v1/documents/<document_id>/blocks/<block_id>/children?document_revision_id=-1' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
    "children": [
        {
            "block_type": 43,
            "board": {
                "align": 1
            }
        }
    ],
    "index": 0
}'
```
* 请求参数说明：
  - `block_type`: 块类型，固定为 43（画板块）
  - `board.align`: 对齐方式（可选），1=左对齐（默认），2=居中，3=右对齐
  - `index`: 插入位置索引（可选），默认为 0

* 返回数据：
```
{
    "code": 0,
    "data": {
        "children": [
            {
                "block_id": "<block_id>",
                "block_type": 43,
                "board": {
                    "align": 1,
                    "token": "<whiteboard_id>"
                },
                "parent_id": "<parent_block_id>"
            }
        ],
        "client_token": "bc25a4f0-9a24-4ade-9ca2-6c1db43fa61d",
        "document_revision_id": 7
    },
    "msg": "success"
}
```
> 注：创建成功后，返回数据中的 `board.token` 字段即为画板ID（whiteboard_id），后续需要使用此token来填充画板内容。

### 22.2 填充画板内容（创建图表节点，支持 PlantUML 和 Mermaid）
* 请求接口：
```
curl -i -X POST 'https://open.feishu.cn/open-apis/board/v1/whiteboards/<whiteboard_id>/nodes/plantuml' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
    "plant_uml_code": "@startuml\nAlice -> Bob: Hello\nBob -> Alice: Hi\n@enduml",
    "style_type": 1,
    "syntax_type": 1
}'
```

* 请求参数说明：
  - `plant_uml_code`: 图表代码（必填），支持 PlantUML 或 Mermaid 格式的完整图表代码
  - `style_type`: 样式类型（必填），1=画板样式（解析为多个画板节点，不可二次编辑），2=经典样式（解析为图片，可二次编辑，仅 PlantUML 支持）
  - `syntax_type`: 语法类型（必填），1=PlantUML 语法，2=Mermaid 语法

* PlantUML 格式示例（syntax_type: 1）：
```
{
    "plant_uml_code": "@startuml\nAlice -> Bob: Hello\n@enduml",
    "style_type": 1,
    "syntax_type": 1
}
```

* Mermaid 格式示例（syntax_type: 2）：
```
{
    "plant_uml_code": "graph TD\nA[Start] --> B[End]",
    "style_type": 1,
    "syntax_type": 2
}
```

* 返回数据：
```
{
    "code": 0,
    "data": {
        "node_id": "o1:1"
    },
    "msg": "success"
}
```

* 使用流程：
  1. 首先使用创建块接口创建画板块（block_type: 43），获取返回的 `board.token`
  2. 使用获取到的 `token` 作为 URL 路径中的 `whiteboard_id` 参数，调用填充画板内容接口
  3. 根据要创建的图表类型，设置 `syntax_type`：1=PlantUML，2=Mermaid
  4. 设置 `style_type`：1=画板样式（推荐），2=经典样式（仅 PlantUML 支持）

* 支持的图表类型：
  - **PlantUML (syntax_type: 1)**: 时序图、活动图、类图、用例图、组件图、思维导图、流程图等
  - **Mermaid (syntax_type: 2)**: 流程图、时序图、类图、ER图、甘特图、状态图、组件图等

## 23.获取知识空间列表
* 请求：
```
curl -i -X GET 'https://open.feishu.cn/open-apis/wiki/v2/spaces?page_size=20' \
-H 'Authorization: Bearer <access_token>'
```
* 返回数据
```
{
  "code": 0,
  "data": {
    "has_more": false,
    "items": [
      {
        "description": "音乐文档",
        "name": "android开发",
        "open_sharing": "closed",
        "space_id": "<space_id>",
        "space_type": "team",
        "visibility": "public"
      },
      {
        "description": "",
        "name": "",
        "open_sharing": "closed",
        "space_id": "<space_id>",
        "space_type": "team",
        "visibility": "public"
      },
      {
        "description": "知识空间描述",
        "name": "知识空间",
        "open_sharing": "closed",
        "space_id": "<space_id>",
        "space_type": "team",
        "visibility": "private"
      }
    ],
    "page_token": "<page_token>"
  },
  "msg": "success"
}
```

## 24.获取“我的知识库”
* 请求
```
curl -i -X GET 'https://open.feishu.cn/open-apis/wiki/v2/spaces/my_library?lang=en' \
-H 'Authorization: Bearer <access_token>'
```
* 返回
```
{
  "code": 0,
  "data": {
    "space": {
      "description": "",
      "name": "My Document Library",
      "open_sharing": "closed",
      "space_id": "<space_id>",
      "space_type": "my_library",
      "visibility": "private"
    }
  },
  "msg": "success"
}
```
## 25. 获取知识空间子节点列表
* 请求
```
curl -i -X GET 'https://open.feishu.cn/open-apis/wiki/v2/spaces/<space_id>/nodes?parent_node_token=<parent_node_token>' \
-H 'Authorization: Bearer <access_token>'
```
* 结果
```
{
  "code": 0,
  "data": {
    "has_more": false,
    "items": [
      {
        "creator": "<user_id>",
        "has_child": false,
        "node_create_time": "1741869192",
        "node_token": "<node_token>",
        "node_type": "origin",
        "obj_create_time": "1741869192",
        "obj_edit_time": "1743480561",
        "obj_token": "<obj_token>",
        "obj_type": "docx",
        "origin_node_token": "<node_token>",
        "origin_space_id": "<space_id>",
        "owner": "<user_id>",
        "parent_node_token": "<parent_node_token>",
        "space_id": "<space_id>",
        "title": "UI"
      },
      {
        "creator": "<user_id>",
        "has_child": true,
        "node_create_time": "1741869203",
        "node_token": "<node_token>",
        "node_type": "origin",
        "obj_create_time": "1741869203",
        "obj_edit_time": "1744719507",
        "obj_token": "<obj_token>",
        "obj_type": "docx",
        "origin_node_token": "<node_token>",
        "origin_space_id": "<space_id>",
        "owner": "<user_id>",
        "parent_node_token": "<parent_node_token>",
        "space_id": "<space_id>",
        "title": "工具类"
      },
      {
        "creator": "<user_id>",
        "has_child": false,
        "node_create_time": "1766946018",
        "node_token": "<node_token>",
        "node_type": "origin",
        "obj_create_time": "1766946018",
        "obj_edit_time": "1766946050",
        "obj_token": "<obj_token>",
        "obj_type": "docx",
        "origin_node_token": "<node_token>",
        "origin_space_id": "<space_id>",
        "owner": "<user_id>",
        "parent_node_token": "<parent_node_token>",
        "space_id": "<space_id>",
        "title": "Feishu MCP 测试文档"
      },
      {
        "creator": "<user_id>",
        "has_child": false,
        "node_create_time": "1767804757",
        "node_token": "<node_token>",
        "node_type": "origin",
        "obj_create_time": "1767804757",
        "obj_edit_time": "1767804819",
        "obj_token": "<obj_token>",
        "obj_type": "docx",
        "origin_node_token": "<node_token>",
        "origin_space_id": "<space_id>",
        "owner": "<user_id>",
        "parent_node_token": "<parent_node_token>",
        "space_id": "<space_id>",
        "title": "一篇新的文档"
      }
    ],
    "page_token": ""
  },
  "msg": "success"
}
```

## 26.创建知识空间节点
* 请求
```
curl -i -X POST 'https://open.feishu.cn/open-apis/wiki/v2/spaces/<space_id>/nodes' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"node_type": "origin",
	"obj_type": "docx",
	"parent_node_token": "<parent_node_token>",
	"title": "哈哈哈哈te111st"
}'
```
node_type 默认为origin，无需传入
obj_type 默认为docx，无需传入
* 返回
```
{
  "code": 0,
  "data": {
    "node": {
      "creator": "",
      "has_child": false,
      "node_create_time": "1768013397",
      "node_token": "<node_token>",
      "node_type": "origin",
      "obj_create_time": "1768013397",
      "obj_edit_time": "1768013397",
      "obj_token": "<obj_token>",
      "obj_type": "docx",
      "origin_node_token": "<node_token>",
      "origin_space_id": "<space_id>",
      "owner": "<user_id>",
      "parent_node_token": "<parent_node_token>",
      "space_id": "<space_id>",
      "title": "哈哈哈哈te111st"
    }
  },
  "msg": "success"
}
```


## 27.搜索知识库
* 请求
```
curl -i -X POST 'https://open.feishu.cn/open-apis/wiki/v1/nodes/search?page_size=20' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <access_token>' \
-d '{
	"query": "andorid"
}'
```
* 返回
```
{
  "code": 0,
  "data": {
    "has_more": true,
    "items": [
      {
        "node_id": "<node_id>",
        "obj_token": "<obj_token>",
        "obj_type": 8,
        "parent_id": "",
        "sort_id": 1,
        "space_id": "<space_id>",
        "title": "Android四大组件",
        "url": "https://<domain>.feishu.cn/wiki/<node_id>"
      },
      {
        "node_id": "<node_id>",
        "obj_token": "<obj_token>",
        "obj_type": 8,
        "parent_id": "",
        "sort_id": 2,
        "space_id": "<space_id>",
        "title": "ContentProvider",
        "url": "https://<domain>.feishu.cn/wiki/<node_id>"
      }
    ],
    "page_token": "<page_token>"
  },
  "msg": "success"
}
```