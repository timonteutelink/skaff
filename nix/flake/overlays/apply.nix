localFlake:
{ self, inputs, ... }: {
  perSystem = { system, ... }: {
    _module.args = {
      pkgs = import inputs.nixpkgs {
        inherit system;
        overlays = [
          inputs.timon-modules.overlays.scripts
          inputs.nix-deno.overlays.default
        ];
        config.allowUnfree = true;
      };
    };
  };
}

