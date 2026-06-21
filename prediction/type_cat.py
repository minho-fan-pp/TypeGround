def classify_type_cat(type_cat):
    """
    Classify a fine-grained type_cat into one of three major categories:
      BuiltIn     — TypeScript intrinsic types, JS/DOM/browser APIs
      Constructed — types formed with TS syntax/operators, function types, utility types
      UserDefined — project-declared types (interfaces, type aliases, classes, enums, etc.)

    Priority order: UserDefined > Constructed > BuiltIn (fallback).
    """
    if type_cat is None:
        return None

    if type_cat == 'userDefined':
        return 'UserDefined'

    function_types = {
        'FunctionType', 'ConstructorType', 'Function', 'CallableFunction',
        'VoidFunction', 'FunctionConstructor'
    }
    if type_cat in function_types:
        return 'Constructed'

    composite_and_utility_types = {
        # Composite types
        'ArrayType', 'UnionType', 'IntersectionType', 'TupleType',
        'TypeLiteral', 'Record', 'LiteralType', 'TemplateLiteralType',
        'ParenthesizedType', 'MappedType', 'IndexedAccessType',
        'ConditionalType', 'TypeOperator', 'TypeQuery', 'TypePredicate',
        'ImportType', 'ThisType', 'Promise', 'PromiseLike',
        # Utility types
        'Partial', 'Readonly', 'Required', 'Pick', 'Omit', 'NonNullable',
        'Awaited', 'ReturnType', 'Parameters', 'InstanceType', 'Exclude',
        'Extract', 'NoInfer', 'InferType', 'ConstructorParameters',
        'ThisParameterType', 'ReadonlyArray'
    }
    if type_cat in composite_and_utility_types:
        return 'Constructed'

    # BuiltIn types: keyword types, built-in objects, arrays, buffers, and browser/Web APIs

    if type_cat.endswith('Keyword'):
        return 'BuiltIn'

    builtin_types = {
        'Date', 'RegExp', 'Error', 'TypeError', 'SyntaxError', 'EvalError',
        'RangeError', 'ReferenceError', 'URIError', 'AggregateError',
        'JSON', 'Console', 'Number', 'String', 'Boolean', 'Object',
        'Symbol', 'BigInt'
    }
    if type_cat in builtin_types or type_cat.endswith('Constructor'):
        return 'BuiltIn'

    array_buffer_types = {
        'Array', 'ArrayLike', 'ArrayBuffer', 'ArrayBufferLike',
        'ArrayBufferView', 'BufferSource', 'Uint8Array', 'Uint8ClampedArray',
        'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
        'Float32Array', 'Float64Array', 'DataView', 'Float32List', 'BigInteger',
        'RegExpMatchArray', 'RegExpExecArray', 'TemplateStringsArray'
    }
    if type_cat in array_buffer_types or (type_cat.endswith('Array') and type_cat != 'ReadonlyArray'):
        return 'BuiltIn'

    if type_cat.startswith('HTML') or type_cat.endswith('Element'):
        return 'BuiltIn'

    if type_cat.startswith('SVG'):
        return 'BuiltIn'

    dom_core_types = {
        'Element', 'HTMLElement', 'Node', 'Document', 'DocumentFragment',
        'Text', 'Comment', 'Attr', 'NodeListOf', 'NodeList', 'HTMLCollection',
        'HTMLCollectionOf', 'ChildNode', 'ParentNode', 'EventTarget',
        'DocumentType', 'XMLDocument', 'HTMLDocument', 'CharacterData',
        'CDATASection', 'ProcessingInstruction', 'DOMParser', 'XMLSerializer',
        'TreeWalker', 'NodeIterator', 'NodeFilter', 'ShadowRoot', 'Selection',
        'Range', 'DOMRect', 'DOMRectReadOnly', 'DOMRectList', 'DOMPoint',
        'DOMMatrix', 'DOMTokenList', 'DOMStringMap', 'DOMException',
        'DOMHighResTimeStamp', 'NamedNodeMap', 'ClientRect', 'XPathResult',
        'XPathExpression', 'XPathNSResolver', 'WindowProxy', 'Credential',
        'MediaDeviceInfo', 'MimeType', 'WeakKey', 'OptionalEffectTiming',
        'KeyAlgorithm', 'ViewTransition', 'PerformanceEntryList'
    }
    if type_cat in dom_core_types:
        return 'BuiltIn'

    event_types = {
        'Event', 'MouseEvent', 'KeyboardEvent', 'TouchEvent', 'PointerEvent',
        'WheelEvent', 'DragEvent', 'FocusEvent', 'InputEvent', 'ClipboardEvent',
        'CustomEvent', 'ErrorEvent', 'CloseEvent', 'MessageEvent', 'ProgressEvent',
        'StorageEvent', 'TransitionEvent', 'AnimationEvent', 'PromiseRejectionEvent',
        'SubmitEvent', 'ToggleEvent', 'MIDIMessageEvent', 'RTCTrackEvent',
        'AudioProcessingEvent', 'MediaQueryListEvent', 'EventListener',
        'EventListenerOrEventListenerObject', 'EventListenerOptions',
        'AddEventListenerOptions', 'EventInit', 'MouseEventInit', 'KeyboardEventInit',
        'PointerEventInit', 'DragEventInit', 'FocusEventInit', 'InputEventInit',
        'ClipboardEventInit', 'ErrorEventInit', 'WheelEventInit', 'UIEventInit',
        'EventModifierInit', 'CustomEventInit', 'CustomElementRegistry',
        'OnErrorEventHandler', 'UnderlyingSource'
    }
    if type_cat in event_types or type_cat.endswith('Event'):
        return 'BuiltIn'

    touch_types = {'Touch', 'TouchList'}
    if type_cat in touch_types or type_cat.endswith('Touch'):
        return 'BuiltIn'

    canvas_webgl_types = {
        'CanvasRenderingContext2D', 'CanvasRenderingContext2DSettings',
        'OffscreenCanvasRenderingContext2D', 'OffscreenCanvas', 'CanvasImageSource',
        'CanvasPattern', 'CanvasGradient', 'Path2D', 'ImageData', 'ImageDataArray',
        'TextMetrics', 'CanvasState', 'WebGLRenderingContext', 'WebGL2RenderingContext',
        'WebGLTexture', 'WebGLProgram', 'WebGLShader', 'WebGLBuffer', 'WebGLFramebuffer',
        'WebGLRenderbuffer', 'WebGLUniformLocation', 'WebGLVertexArrayObject',
        'WebGLQuery', 'WebGLActiveInfo', 'WebGLSync', 'WebGLContextAttributes',
        'RenderingContext', 'ANGLE_instanced_arrays', 'OES_vertex_array_object',
        'WEBGL_compressed_texture_s3tc', 'WEBGL_lose_context', 'WEBGL_debug_renderer_info',
        'TexImageSource', 'HTMLCanvasElement'
    }
    if type_cat in canvas_webgl_types or 'Canvas' in type_cat or 'WebGL' in type_cat or type_cat.startswith('WEBGL_'):
        return 'BuiltIn'

    web_api_types = {
        'Response', 'Request', 'URL', 'URLSearchParams',
        'Headers', 'Body', 'RequestInit', 'RequestInfo', 'RequestMode',
        'RequestCache', 'ResponseInit', 'ResponseType', 'HeadersInit',
        'BodyInit', 'XMLHttpRequest', 'XMLHttpRequestBodyInit',
        'AbortSignal', 'AbortController', 'ReadableStream', 'WritableStream',
        'TransformStream', 'QueuingStrategy', 'CountQueuingStrategy',
        'ReadableStreamDefaultReader', 'ReadableStreamDefaultController',
        'ReadableStreamController', 'ReadableStreamReader', 'ReadableStreamReadResult',
        'ReadableByteStreamController', 'WritableStreamDefaultWriter',
        'TransformStreamDefaultController', 'DecompressionStream', 'CompressionStream',
        'Transformer', 'TransferFunction',
        'DataTransfer', 'DataTransferItem', 'DataTransferItemList',
        'FontFace', 'FontFaceSet',
        'DOMRectInit'
    }
    if type_cat in web_api_types:
        return 'BuiltIn'

    browser_api_types = {
        'Window', 'Location', 'History', 'Navigator', 'Screen', 'Performance',
        'PerformanceEntry', 'PerformanceResourceTiming', 'PerformanceMeasure',
        'PerformanceObserver', 'FrameRequestCallback', 'IdleDeadline', 'IdleRequestOptions',
        'Storage', 'StorageEvent', 'StorageManager', 'Cache', 'ServiceWorker',
        'ServiceWorkerRegistration', 'ServiceWorkerContainer', 'PushSubscription',
        'PushSubscriptionJSON', 'Notification', 'NotificationOptions', 'Geolocation',
        'GeolocationPosition', 'PositionOptions', 'MediaQueryList', 'MediaQueryListEvent',
        'Clipboard', 'ClipboardItem', 'ClipboardItems', 'ClipboardItemOptions',
        'CookieStore', 'Lock', 'LockOptions', 'Permissions', 'ShareData',
        'FileSystem', 'FileSystemEntry', 'FileSystemFileEntry', 'FileSystemDirectoryEntry',
        'FileSystemFileHandle', 'FileSystemWritableFileStream', 'FileSystemDirectoryReader',
        'FileReader', 'File', 'Blob', 'BlobCallback', 'BlobPropertyBag', 'FormData',
        'MediaStream', 'MediaStreamTrack', 'MediaStreamConstraints', 'MediaTrackConstraints',
        'MediaTrackSettings', 'MediaTrackCapabilities', 'MediaSessionAction', 'MediaSessionActionHandler',
        'MediaRecorder', 'MediaRecorderOptions', 'MediaSource', 'SourceBuffer',
        'VideoEncoder', 'VideoEncoderSupport', 'VideoEncoderConfig', 'VideoFrame',
        'AudioEncoder', 'AudioEncoderSupport', 'AudioEncoderConfig', 'AudioData',
        'AudioContext', 'AudioBuffer', 'AudioBufferSourceNode', 'AudioNode',
        'AudioListener', 'GainNode', 'PannerNode', 'MediaElementAudioSourceNode',
        'MediaStreamAudioSourceNode', 'OfflineAudioContext', 'WebSocket', 'MessageChannel',
        'MessagePort', 'MessageEventSource', 'BroadcastChannel', 'Worker', 'WorkerOptions',
        'WorkerType', 'SharedWorker', 'RTCPeerConnection', 'RTCConfiguration', 'RTCDataChannel',
        'RTCDataChannelInit', 'RTCIceCandidate', 'RTCIceCandidateInit', 'RTCSessionDescription',
        'RTCSessionDescriptionInit', 'RTCRtpTransceiverInit', 'RTCRtpTransceiverDirection',
        'RTCRtpSender', 'IntersectionObserver', 'IntersectionObserverEntry',
        'IntersectionObserverInit', 'IntersectionObserverCallback', 'ResizeObserver',
        'ResizeObserverEntry', 'ResizeObserverCallback', 'MutationObserver',
        'MutationObserverInit', 'MutationCallback', 'MutationRecord',
        'CSSStyleDeclaration', 'CSSStyleSheet', 'CSSRule', 'CSSRuleList', 'CSSGroupingRule',
        'CSSStyleRule', 'StyleSheet', 'TextDecoder', 'TextEncoder', 'TextEncoderEncodeIntoResult',
        'Crypto', 'CryptoKey', 'CryptoKeyPair', 'SubtleCrypto', 'KeyFormat', 'KeyType',
        'KeyUsage', 'Algorithm', 'AlgorithmIdentifier', 'EcKeyImportParams', 'EcKeyGenParams',
        'EcdsaParams', 'EcdhKeyDeriveParams', 'AesCtrParams', 'AesCbcParams', 'AesKeyGenParams',
        'RsaHashedImportParams', 'RsaHashedKeyGenParams', 'RsaHashedKeyAlgorithm', 'RsaOaepParams',
        'RsaPssParams', 'RsaKeyGenParams', 'Pbkdf2Params', 'HmacKeyGenParams', 'HmacImportParams',
        'JsonWebKey', 'PaymentRequest', 'SpeechSynthesis', 'SpeechSynthesisVoice',
        'SpeechSynthesisUtterance', 'ImageCapture', 'ImageBitmap', 'MathMLElement',
        'IDBFactory', 'IDBOpenDBRequest', 'IDBDatabase', 'IDBObjectStore', 'IDBTransaction',
        'IDBTransactionMode', 'IDBRequest', 'IDBCursorWithValue', 'IDBValidKey', 'IDBKeyRange',
        'Plugin', 'External', 'Report', 'ClientTypes', 'InsertPosition', 'ScrollToOptions',
        'ScrollIntoViewOptions', 'ScrollOptions', 'ScrollBehavior', 'ScrollLogicalPosition',
        'FocusOptions', 'RegistrationOptions', 'DisplayMediaStreamOptions', 'Keyframe',
        'KeyframeAnimationOptions', 'Animation', 'AnimationEffect', 'KeyframeEffect',
        'MediaError', 'PropertyDescriptor', 'PropertyDescriptorMap', 'TypedPropertyDescriptor',
        'PropertyDefinition', 'PropertyKey', 'MethodDecorator', 'PropertyDecorator',
        'ClassDecorator', 'ParameterDecorator', 'ClassDecoratorContext',
        'ClassAccessorDecoratorTarget', 'ClassAccessorDecoratorContext', 'CustomElementConstructor',
        'ErrorCallback', 'OnErrorEventHandlerNonNull', 'StructuredSerializeOptions',
        'TextTrack', 'TextTrackCue', 'TimeRanges', 'Highlight', 'ShadowRootInit'
    }
    if type_cat in browser_api_types:
        return 'BuiltIn'

    file_api_types = {'FileList'}
    if type_cat in file_api_types:
        return 'BuiltIn'

    if type_cat == 'EventSource':
        return 'BuiltIn'

    if type_cat == 'IArguments':
        return 'BuiltIn'

    return 'BuiltIn'
