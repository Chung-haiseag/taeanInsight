// 토스페이먼츠 통합 — 빌링키 발급·정기결제·결제 검증
// PRD v1.8 §6 REQ-PLATFORM-002 (PG 결정: 토스페이먼츠, v1.1)

export interface TossConfig {
  secretKey: string;           // 시크릿 (Wrangler secret으로 관리)
  baseUrl?: string;            // 기본 https://api.tosspayments.com
}

export interface ConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;              // 원
}

export interface ConfirmPaymentResult {
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  approvedAt: string;          // ISO 8601
  method: string;              // 카드·계좌이체·간편결제
  status: "DONE" | "CANCELED" | "PARTIAL_CANCELED" | "ABORTED" | "EXPIRED";
}

export interface BillingKeyInput {
  authKey: string;
  customerKey: string;         // 자체 사용자 ID
}

export interface BillingKeyResult {
  billingKey: string;
  cardCompany?: string;
  cardNumber?: string;         // 마스킹된 카드번호 (PG가 반환)
  customerKey: string;
}

export interface BillingChargeInput {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
}

export class TossPayments {
  private baseUrl: string;
  constructor(private cfg: TossConfig) {
    this.baseUrl = cfg.baseUrl ?? "https://api.tosspayments.com";
  }

  /** 결제 승인 — 클라이언트 SDK가 결제 후 paymentKey/orderId/amount를 서버에 전달하면 이 메서드로 최종 승인 */
  async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    const res = await this.post("/v1/payments/confirm", input);
    return res as ConfirmPaymentResult;
  }

  /** 빌링키 발급 — 정기결제 첫 카드 등록 */
  async issueBillingKey(input: BillingKeyInput): Promise<BillingKeyResult> {
    const res = await this.post("/v1/billing/authorizations/issue", input);
    return res as BillingKeyResult;
  }

  /** 빌링키로 정기결제 청구 (매달 호출) */
  async chargeBilling(input: BillingChargeInput): Promise<ConfirmPaymentResult> {
    const res = await this.post(`/v1/billing/${input.billingKey}`, {
      customerKey: input.customerKey,
      amount: input.amount,
      orderId: input.orderId,
      orderName: input.orderName,
    });
    return res as ConfirmPaymentResult;
  }

  /** 결제 취소 */
  async cancel(paymentKey: string, cancelReason: string, cancelAmount?: number): Promise<unknown> {
    return this.post(`/v1/payments/${paymentKey}/cancel`, { cancelReason, cancelAmount });
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const auth = btoa(`${this.cfg.secretKey}:`);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Toss API ${res.status}: ${errorBody || res.statusText}`);
    }
    return res.json();
  }
}
