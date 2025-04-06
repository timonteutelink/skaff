localFlake:
{ lib, config, self, inputs, ... }: {
  flake.overlays.default = final: prev:
    localFlake.withSystem prev.stdenv.hostPlatform.system (
      # perSystem parameters. Note that perSystem does not use `final` or `prev`.
      { config, ... }: { timon.software-templator = config.packages.default; }
    );
}
