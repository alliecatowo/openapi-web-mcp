# Swagger UI 5.32.14 hooks

The pinned bundle exposes the relevant public plugin system objects: `specSelectors.specJson`/`specResolved`, `oas3Selectors.selectedServer` and `serverEffectiveValue`, `authSelectors.authorized`, `specActions.execute`, and request/response configuration through `getConfigs()`. The plugin uses the current system selectors and `specActions.execute` rather than a parallel fetch client. If a host's Swagger build does not return an execution result from that action, the adapter reports a bounded Swagger execution error rather than claiming success.
