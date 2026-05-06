export function getBashCompletion(): string {
  return `_vectahub_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  opts="run doctor setup config completion serve client security audit tools list mode history generate schedule daemon templates rollback verify chat export import"

  case "\${prev}" in
    vectahub)
      COMPREPLY=( \$(compgen -W "\${opts}" -- "\${cur}") )
      return 0
      ;;
    config)
      COMPREPLY=( \$(compgen -W "show reset tools" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( \$(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
  esac
}

complete -F _vectahub_completion vectahub`;
}

export function getZshCompletion(): string {
  return `#compdef vectahub

local commands=("run" "doctor" "setup" "config" "completion" "serve" "client" "security" "audit" "tools" "list" "mode" "history" "generate" "schedule" "daemon" "templates" "rollback" "verify" "chat" "export" "import")

_vectahub() {
  local state

  _arguments -C \\\\
    '(-v --verbose)'{-v,--verbose}'[详细输出模式]' \\\\
    '(-d --debug)'{-d,--debug}'[调试模式（包含详细输出）]' \\\\
    '--non-interactive[非交互模式（适用于 CI/CD）]' \\\\
    '1: :->command' \\\\
    '*:: :->args'

  case \$state in
    command)
      _describe 'command' commands
      ;;
    args)
      case "\${words[1]}" in
        config)
          _describe 'subcommand' "show\\ndebug\\ntools"
          ;;
        completion)
          _describe 'shell' "bash\\nzsh\\nfish"
          ;;
      esac
      ;;
  esac
}

_vectahub "\$@"`;
}

export function getFishCompletion(): string {
  return `function __vectahub_completion
  set -l commands "run" "doctor" "setup" "config" "completion" "serve" "client" "security" "audit" "tools" "list" "mode" "history" "generate" "schedule" "daemon" "templates" "rollback" "verify" "chat" "export" "import"
  set -l cmd (commandline -opc)
  set -l subcmd (commandline -ct)

  if test (count \$cmd) -eq 1
    complete -c vectahub -a "\$commands"
  else if test (count \$cmd) -eq 2
    switch \$cmd[2]
      case config
        complete -c vectahub -a "show reset tools" -n "__fish_seen_subcommand_from config"
      case completion
        complete -c vectahub -a "bash zsh fish" -n "__fish_seen_subcommand_from completion"
    end
  end
end

complete -f -c vectahub -a "run doctor setup config completion serve client security audit tools list mode history generate schedule daemon templates rollback verify chat export import"`;
}
