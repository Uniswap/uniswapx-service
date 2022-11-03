import { ObjectSchema } from "joi";
import { APIGLambdaHandler, BaseRInj, ErrorResponse, HandleRequestParams, Response } from "../../lib/handlers/base/handler";

export interface ContainerInjected {
    foo: string,
}

export interface RequestInjected extends BaseRInj {
    bar: string,
}

export interface ReqBody {
    baz: string
}

export interface ReqQueryParams { }

export interface Res {
    foobar: string
}



class ThrowingTestHandler extends APIGLambdaHandler<ContainerInjected,
    RequestInjected,
    ReqBody,
    ReqQueryParams,
    Res> {

    public handleRequest(_params: HandleRequestParams<ContainerInjected, RequestInjected, ReqBody, ReqQueryParams>): Promise<ErrorResponse | Response<Res>> {
        throw new Error("Method not implemented.");
    }
    protected requestBodySchema(): ObjectSchema<any> | null {
        throw new Error("Method not implemented.");
    }
    protected requestQueryParamsSchema(): ObjectSchema<any> | null {
        throw new Error("Method not implemented.");
    }
    protected responseBodySchema(): ObjectSchema<any> | null {
        throw new Error("Method not implemented.");
    }
}

describe("APIGLambdaHandler", () => {
    it("Should throw if handlerName is not defined", () => {
        expect(() => { new ThrowingTestHandler(undefined as any, {} as any); }).toThrow()
    })

    it("Should throw if injectorPromise is not defined", () => {
        expect(() => { new ThrowingTestHandler("handlerName", null as any); }).toThrow()
    })
});