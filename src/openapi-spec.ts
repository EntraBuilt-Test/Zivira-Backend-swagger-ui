// src/openapi-spec.ts
//
// Auto-generated structural OpenAPI 3.0 spec for this backend's real
// routes (auth, company/admin, manager, field, ess, superadmin, masters
// registry, seed, health) -- built from the route table (method + path +
// whether it needs a bearer token), not hand-written per-field schemas.
// Served at GET /api-docs via swagger-ui-express (see server.ts). Login
// with POST /api/auth/login first, then use the returned token with
// Swagger UI's Authorize button to try any other endpoint.
export const openApiSpec = {
  "openapi": "3.0.3",
  "info": {
    "title": "Zivira Labs Backend API",
    "version": "1.0.0",
    "description": "Real Zivira Labs backend (Admin/Company, Manager, Field, Employee Self-Service/HR, and SuperAdmin portals), ported from Zivira-Backend-main onto this Render service. Most endpoints require a bearer token obtained from POST /api/auth/login. This is a structural reference generated from the route table (method + path + auth requirement) rather than a hand-written spec, so request/response bodies are shown as generic objects rather than fully detailed field-by-field schemas \u2014 use 'Try it out' against a real login token to see actual shapes."
  },
  "servers": [
    {
      "url": "/"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Obtain via POST /api/auth/login, then use the returned token here."
      }
    }
  },
  "paths": {
    "/api/auth/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "POST /auth/login",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/auth/change-password": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "POST /auth/change-password",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/dashboard": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/dashboard",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/employees": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/employees",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/employees",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/employees/{employeeCode}": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/employees/:employeeCode",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctors": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctors",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctors",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctors/clinics": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctors/clinics",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/doctors/celebrations": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctors/celebrations",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/doctors/{id}": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/doctors/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/products": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/products",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/products",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/dcrs": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/dcrs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/dcrs/{id}": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/dcrs/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/dcrs/{id}/approve": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/dcrs/:id/approve",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/manager-activity": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/manager-activity",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/stockists": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/stockists",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/stockists",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/stockists/bulk": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/stockists/bulk",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/field-force-status": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/field-force-status",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/notices": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/notices",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/notices",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/activity": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/activity",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/subdivisions": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/subdivisions",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/subdivisions",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/subdivisions/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/subdivisions/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/subdivisions/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/subdivisions/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/fieldforce": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/fieldforce",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/product-categories": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/product-categories",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-categories",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-categories/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/product-categories/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-categories/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-categories/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-categories/{id}/reactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-categories/:id/reactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-brands": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/product-brands",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-brands",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-brands/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/product-brands/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-brands/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-brands/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-brands/{id}/reactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-brands/:id/reactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-catalog": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/product-catalog",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-catalog",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-catalog/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/product-catalog/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-catalog/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-catalog/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-catalog/{id}/reactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/product-catalog/:id/reactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-categories": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctor-categories",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-categories",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-categories/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/doctor-categories/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-categories/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-categories/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-categories/{id}/reactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-categories/:id/reactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-specialities": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctor-specialities",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-specialities",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-specialities/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/doctor-specialities/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-specialities/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-specialities/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-specialities/{id}/reactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-specialities/:id/reactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-qualifications": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctor-qualifications",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-qualifications",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-qualifications/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/doctor-qualifications/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-qualifications/{id}/deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-qualifications/:id/deactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/doctor-qualifications/{id}/reactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/doctor-qualifications/:id/reactivate",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/product-groups": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/product-groups",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/dealers": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/dealers",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/dealers",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/dealers/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/dealers/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/holidays": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/holidays",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/sfc": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/sfc",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/expenses": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/expenses",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/hospitals": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/hospitals",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/hospitals",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/hospitals/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/hospitals/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/unlisted-doctors": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/unlisted-doctors",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/unlisted-doctors",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/unlisted-doctors/{id}": {
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/unlisted-doctors/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/territory/doctor-counts": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/territory/doctor-counts",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/territory/bulk-deactivate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/territory/bulk-deactivate",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/branches": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/branches",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/branches",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/branches/{id}": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/branches/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/branches/lookup": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/branches/lookup",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/tour-plans": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/tour-plans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/expense-claims": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/expense-claims",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/expense-claims/branch-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/expense-claims/branch-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/visit-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/visit-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/compliance": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/compliance",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/payroll": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/payroll",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/payroll/{id}/release": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/analytics/payroll/:id/release",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/analytics/rep-manager": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/rep-manager",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/product-exposure": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/product-exposure",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/sample-allocations": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/sample-allocations",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/sample-allocations",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/sample-distribution": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/sample-distribution",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/kpi": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/kpi",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/alerts": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/alerts",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/drug-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/drug-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/gift-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/gift-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/doctor-coverage": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/doctor-coverage",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/config": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/config",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/config/{key}": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/config/:key",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/salary-structures": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/salary-structures",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/salary-structures",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/payroll/rules": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/payroll/rules",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PUT /company/payroll/rules",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/comp-offs": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/comp-offs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/comp-offs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/payroll/runs": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/payroll/runs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/payroll/runs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/payroll/runs/{id}": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/payroll/runs/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/payroll/runs/{id}/approve": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/payroll/runs/:id/approve",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/payroll/runs/{id}/lock": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/payroll/runs/:id/lock",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/payroll/runs/{id}/payslip": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/payroll/runs/:id/payslip",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/analytics/sales-achievement": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/analytics/sales-achievement",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/onboarding": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/onboarding",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/onboarding/{employeeCode}": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/onboarding/:employeeCode",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/onboarding/{employeeCode}/generate": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/onboarding/:employeeCode/generate",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/onboarding/{employeeCode}/trigger-mail": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/onboarding/:employeeCode/trigger-mail",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/onboarding/{employeeCode}/documents/{docName}/verify": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/onboarding/:employeeCode/documents/:docName/verify",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "docName",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/onboarding/{employeeCode}/documents/{docName}/reject": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/onboarding/:employeeCode/documents/:docName/reject",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "docName",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/onboarding/{employeeCode}/complete": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/onboarding/:employeeCode/complete",
        "parameters": [
          {
            "name": "employeeCode",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/attendance/import": {
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/attendance/import",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/attendance": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/attendance",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/leave": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/leave",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/leave/{id}/approve": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/leave/:id/approve",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/leave/{id}/reject": {
      "patch": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "PATCH /company/leave/:id/reject",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/loans": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/loans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/loans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/arrears": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/arrears",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "POST /company/arrears",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/hr-dashboard": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/hr-dashboard",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/reports/payroll-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/reports/payroll-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/reports/payroll-export": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/reports/payroll-export",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/reports/statutory-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/reports/statutory-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/reports/ot-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/reports/ot-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/reports/comp-off-summary": {
      "get": {
        "tags": [
          "Company (Admin)"
        ],
        "summary": "GET /company/reports/comp-off-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/notices": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/notices",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/managers": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/managers",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/team": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/team",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Manager"
        ],
        "summary": "POST /manager/team",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/dcrs": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/dcrs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/dcrs/{id}/approve": {
      "post": {
        "tags": [
          "Manager"
        ],
        "summary": "POST /manager/dcrs/:id/approve",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/dcrs/{id}/reject": {
      "post": {
        "tags": [
          "Manager"
        ],
        "summary": "POST /manager/dcrs/:id/reject",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/leave-applications": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/leave-applications",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/leave-applications/{id}/approve": {
      "post": {
        "tags": [
          "Manager"
        ],
        "summary": "POST /manager/leave-applications/:id/approve",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/leave-applications/{id}/reject": {
      "post": {
        "tags": [
          "Manager"
        ],
        "summary": "POST /manager/leave-applications/:id/reject",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/dashboard": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/dashboard",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/tour-plans": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/tour-plans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/tour-plans/cross-team": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/tour-plans/cross-team",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/tour-plans/{tpId}/approve": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/tour-plans/:tpId/approve",
        "parameters": [
          {
            "name": "tpId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/tour-plans/{tpId}/reject": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/tour-plans/:tpId/reject",
        "parameters": [
          {
            "name": "tpId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/tour-plans/{tpId}/void": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/tour-plans/:tpId/void",
        "parameters": [
          {
            "name": "tpId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/tour-plans/{tpId}/reassign": {
      "post": {
        "tags": [
          "Manager"
        ],
        "summary": "POST /manager/tour-plans/:tpId/reassign",
        "parameters": [
          {
            "name": "tpId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/expense-claims": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/expense-claims",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/expense-claims/cross-team": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/expense-claims/cross-team",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/expense-claims/{claimId}/approve": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/expense-claims/:claimId/approve",
        "parameters": [
          {
            "name": "claimId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/expense-claims/{claimId}/reject": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/expense-claims/:claimId/reject",
        "parameters": [
          {
            "name": "claimId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/visit-coverage": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/visit-coverage",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/analytics/compliance": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/analytics/compliance",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/analytics/payroll": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/analytics/payroll",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/manager/analytics/payroll/{id}/approve": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/analytics/payroll/:id/approve",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/analytics/payroll/{id}/reject": {
      "patch": {
        "tags": [
          "Manager"
        ],
        "summary": "PATCH /manager/analytics/payroll/:id/reject",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/manager/analytics/rep-manager": {
      "get": {
        "tags": [
          "Manager"
        ],
        "summary": "GET /manager/analytics/rep-manager",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/dashboard": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/dashboard",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/notices": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/notices",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/managers": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/managers",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/doctors": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/doctors",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/dcrs": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/dcrs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/dcrs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/visit-summary": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/visit-summary",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/unvisited-doctors": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/unvisited-doctors",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/exception-reasons": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/exception-reasons",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/doctor-exceptions": {
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/doctor-exceptions",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/doctor-exceptions",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/products": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/products",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/gift-items": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/gift-items",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/branches": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/branches",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/branches/lookup": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/branches/lookup",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/tour-plans": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/tour-plans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/tour-plans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/tour-plans/{tpId}/locations": {
      "patch": {
        "tags": [
          "Field"
        ],
        "summary": "PATCH /field/tour-plans/:tpId/locations",
        "parameters": [
          {
            "name": "tpId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/expense-claims": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/expense-claims",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/expense-claims",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/attendance/check-in": {
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/attendance/check-in",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/attendance/check-out": {
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/attendance/check-out",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/leave-reasons": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/leave-reasons",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/leave-applications": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/leave-applications",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Field"
        ],
        "summary": "POST /field/leave-applications",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/field/payroll-status": {
      "get": {
        "tags": [
          "Field"
        ],
        "summary": "GET /field/payroll-status",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/field/payroll-status/{id}/explanation": {
      "patch": {
        "tags": [
          "Field"
        ],
        "summary": "PATCH /field/payroll-status/:id/explanation",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/profile": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/profile",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/ess/onboarding": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/onboarding",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "PUT /ess/onboarding",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/onboarding/documents/{docName}": {
      "post": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "POST /ess/onboarding/documents/:docName",
        "parameters": [
          {
            "name": "docName",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/profile/driving-license": {
      "patch": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "PATCH /ess/profile/driving-license",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/onboarding/submit": {
      "post": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "POST /ess/onboarding/submit",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/attendance": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/attendance",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/ess/attendance/punch": {
      "post": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "POST /ess/attendance/punch",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/leave": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/leave",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "POST /ess/leave",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ess/leave/types": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/leave/types",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/ess/comp-offs": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/comp-offs",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/ess/payslips": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/payslips",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/ess/payslips/{id}": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/payslips/:id",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/ess/loans": {
      "get": {
        "tags": [
          "ESS (Employee Self-Service)"
        ],
        "summary": "GET /ess/loans",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/superadmin/dashboard": {
      "get": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "GET /superadmin/dashboard",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/superadmin/tenants": {
      "get": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "GET /superadmin/tenants",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "POST /superadmin/tenants",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/superadmin/tenants/{slug}": {
      "get": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "GET /superadmin/tenants/:slug",
        "parameters": [
          {
            "name": "slug",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "patch": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "PATCH /superadmin/tenants/:slug",
        "parameters": [
          {
            "name": "slug",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "DELETE /superadmin/tenants/:slug",
        "parameters": [
          {
            "name": "slug",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/superadmin/modules": {
      "get": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "GET /superadmin/modules",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "POST /superadmin/modules",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/superadmin/feature-flags": {
      "get": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "GET /superadmin/feature-flags",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "POST /superadmin/feature-flags",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/superadmin/feature-flags/{key}": {
      "patch": {
        "tags": [
          "SuperAdmin"
        ],
        "summary": "PATCH /superadmin/feature-flags/:key",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/masters": {
      "get": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "GET /company/masters/",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/masters/{key}/schema": {
      "get": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "GET /company/masters/:key/schema",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/company/masters/{key}": {
      "get": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "GET /company/masters/:key",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "POST /company/masters/:key",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/masters/{key}/{id}": {
      "put": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "PUT /company/masters/:key/:id",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/masters/{key}/{id}/deactivate": {
      "post": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "POST /company/masters/:key/:id/deactivate",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/company/masters/{key}/{id}/reactivate": {
      "post": {
        "tags": [
          "Masters Registry"
        ],
        "summary": "POST /company/masters/:key/:id/reactivate",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/inspect/{key}": {
      "get": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "GET /seed/inspect/:key",
        "parameters": [
          {
            "name": "key",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ]
      }
    },
    "/api/seed/fix-data": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/fix-data",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/exact-10": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/exact-10",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/base": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/base",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/run": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/run",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/create-abm002": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/create-abm002",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/hr-user": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/hr-user",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/seed/leave-types": {
      "post": {
        "tags": [
          "Seed (ops)"
        ],
        "summary": "POST /seed/leave-types",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        },
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/health": {
      "get": {
        "tags": [
          "Health"
        ],
        "summary": "GET /health",
        "parameters": [],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "Bad request"
          },
          "401": {
            "description": "Missing or invalid auth token"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    }
  }
} as const;
