/**
 * Mock 数据服务
 * 对标原版 XhsShopContext Mock 模式
 *
 * 用于开发和测试环境，不实际调用小红书 API
 */
import { LoggerService } from './logger.service'

export class MockService {
  private logger: LoggerService
  private enabled = false

  constructor(logger: LoggerService) {
    this.logger = logger
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.logger.info(`[Mock] 模式已${enabled ? '启用' : '禁用'}`)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * 模拟订单列表
   */
  mockOrderList() {
    return {
      success: true,
      data: {
        orders: [
          {
            order_id: 'mock_order_001',
            order_status: 'paid',
            buyer_info: {
              user_id: 'mock_user_001',
              nickname: '测试买家A',
              phone: '138****8888'
            },
            product_info: {
              product_id: 'mock_product_001',
              title: '测试商品-虚拟卡密',
              price: 99.00,
              quantity: 1
            },
            shipping_info: {
              address: '测试地址',
              tracking_number: null,
              courier: null
            },
            created_at: Date.now(),
            paid_at: Date.now()
          },
          {
            order_id: 'mock_order_002',
            order_status: 'paid',
            buyer_info: {
              user_id: 'mock_user_002',
              nickname: '测试买家B',
              phone: '139****9999'
            },
            product_info: {
              product_id: 'mock_product_002',
              title: '测试商品-会员卡',
              price: 199.00,
              quantity: 1
            },
            shipping_info: {
              address: '测试地址2',
              tracking_number: null,
              courier: null
            },
            created_at: Date.now() - 3600000,
            paid_at: Date.now() - 3500000
          }
        ],
        total: 2,
        page: 1,
        page_size: 20
      }
    }
  }

  /**
   * 模拟客服消息
   */
  mockKefuMessage() {
    return {
      type: 'kefu_message',
      data: {
        msg_id: 'mock_msg_001',
        from_user: 'mock_user_001',
        to_user: 'shop_owner',
        content: '你好，请问有货吗？',
        msg_type: 'text',
        timestamp: Date.now()
      }
    }
  }

  /**
   * 模拟 WebSocket 消息
   */
  mockWsMessage(type: string) {
    const messages: Record<string, any> = {
      'order_paid': this.mockOrderList(),
      'kefu_message': this.mockKefuMessage(),
      'order_refund': {
        type: 'order_refund',
        data: {
          order_id: 'mock_order_001',
          refund_reason: '测试退款',
          refund_amount: 99.00
        }
      }
    }

    return messages[type] || { type: 'unknown', data: {} }
  }

  /**
   * 模拟发货响应
   */
  mockShipResponse(orderId: string) {
    return {
      success: true,
      message: '发货成功（Mock）',
      data: {
        order_id: orderId,
        tracking_number: `MOCK${Date.now()}`,
        courier: 'mock_express',
        shipped_at: Date.now()
      }
    }
  }

  /**
   * 模拟登录响应
   */
  mockLoginResponse() {
    return {
      success: true,
      data: {
        shop_id: 'mock_shop_001',
        shop_name: '测试店铺',
        user_id: 'mock_user',
        token: 'mock_token_xxxxx',
        expires_at: Date.now() + 86400000
      }
    }
  }
}
